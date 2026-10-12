import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Redis } from "ioredis";
import { trusted, type Types } from "mongoose";
import { HttpError } from "../../lib/http-error.js";
import type { Logger } from "../../lib/logger.js";
import type { Mailer } from "../../lib/mailer.js";
import { RedisRateLimitStore, clientKey } from "../../middleware/rate-limit.js";
import { consumeOneTimeToken, issueOneTimeToken, type OneTimeKind } from "../../utils/one-time-token.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";
import { createSession, getSession, revokeAllUserSessions, revokeSession, rotateSession } from "../../utils/session-store.js";
import { isTokenExpiredError, newRefreshTokenId, newSessionId, sha256, signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from "../../utils/tokens.js";
import type { AccessClaims } from "../../utils/tokens.js";
import type { AuditEntry, AuditRecorder } from "../audit/audit.service.js";
import type { AuditEventName } from "../audit/audit.model.js";
import { User, type IUser } from "../users/user.model.js";
import { USER_ROLES, USER_STATUSES, type BlockReason, type RegisterUserInput, type UserRole, type UserStatus } from "../users/user.validation.js";
import { accountBlockedEmail, alreadyRegisteredEmail, detailsUnavailableEmail, loginCodeEmail, mfaChangedEmail, passwordChangedEmail, passwordResetEmail, verificationEmail } from "./auth.emails.js";
import type { AuthScope, ScopePolicy } from "./auth.policy.js";

export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  phoneNumber?: string;
  role: UserRole;
  emailVerified: boolean;
  phoneVerified: boolean;
  mfaEnabled: boolean;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshMaxAgeMs: number;
}

export interface MfaChallenge {
  challengeId: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: IssuedTokens;
}

export interface ClientContext {
  userAgent: string;
  ip: string;
  // Any refresh token the browser already holds; it is revoked on login to prevent session fixation.
  currentRefreshToken: unknown;
}

export interface AuthServiceDeps {
  redis: Redis;
  policies: Record<AuthScope, ScopePolicy>;
  secrets: Record<AuthScope, string>;
  storefrontUrl: string;
  adminUrl: string;
  logger: Logger;
  mailer: Mailer;
  audit: AuditRecorder;
}

type UserDocument = IUser & { _id: Types.ObjectId };

const FAILURE_WINDOW_MS = 15 * 60 * 1000;
// Wrong passwords for one account (from any client) or wrong emailed codes: this many blocks the account.
const MAX_WRONG_ATTEMPTS = 3;
// How many sign-in codes can be requested per window, so the login form can't be used to flood an inbox.
const MAX_CODE_REQUESTS = 10;
// A blocked account stays blocked this long, unless the owner resets the password from an emailed link first.
const BLOCK_TTL_SEC = 24 * 60 * 60;
const EMAIL_LINK_TTL_SEC = { verify: 24 * 60 * 60, reset: 60 * 60 };
// Verification emails: at most this many resends per window; asking for another one blocks the account.
const MAX_VERIFICATION_RESENDS = 3;
const RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_SEC = 60;
const LOGIN_CODE_TTL_SEC = 5 * 60;
const CODE_RESEND_COOLDOWN_SEC = 30;
const RESET_KIND: Record<AuthScope, OneTimeKind> = { user: "reset-password", admin: "reset-admin-password" };

export const unauthenticated = (code = "UNAUTHENTICATED"): HttpError => new HttpError(401, code, "Authentication required");
const invalidCredentials = (): HttpError => new HttpError(401, "INVALID_CREDENTIALS", "Invalid credentials");
const invalidToken = (): HttpError => new HttpError(400, "INVALID_TOKEN", "This link is invalid or has expired");
const tooManyAttempts = (): HttpError => new HttpError(429, "TOO_MANY_ATTEMPTS", "Too many attempts. Please try again later.");
// Worded so it is also true for an identifier with no account behind it, which gets the same answer.
const accountBlocked = (): HttpError =>
  new HttpError(403, "ACCOUNT_BLOCKED", "Too many failed attempts, so sign-in is blocked for 24 hours. If this is your account, reset your password to unblock it now.");

const isBlocked = (doc: Pick<IUser, "blockedUntil">): boolean => doc.blockedUntil != null && new Date(doc.blockedUntil).getTime() > Date.now();
// Matches users that are not currently blocked (trusted: sanitizeFilter is on, and this operator is ours, not user input).
const notBlocked = () => trusted({ $not: { $gt: new Date() } });

// Wrong passwords are counted per identifier (email or username), so the answer is the same whether or not an account exists.
const loginFailureKey = (scope: AuthScope, identifier: string): string => `lf:${scope}:${sha256(identifier)}`;
const identifierBlockKey = (scope: AuthScope, identifier: string): string => `blk:${scope}:${sha256(identifier)}`;

// Every Redis key that keeps an account blocked or counts towards a block, in both scopes. Cleared when it is unblocked.
export function accountBlockKeys(user: { _id: Types.ObjectId | string; email: string; userName: string }): string[] {
  const userId = user._id.toString();
  const perIdentifier = (["user", "admin"] as const).flatMap((scope) => [user.email, user.userName].flatMap((identifier) => [loginFailureKey(scope, identifier), identifierBlockKey(scope, identifier)]));
  return [...perIdentifier, `lf:cp:${userId}`, `mfa-code:${userId}`, `resend-count:${userId}`, `resend-cooldown:${userId}`];
}

// The only user shape that ever leaves the API: no hash, status or internal timestamps.
const toPublicUser = (doc: UserDocument): PublicUser => ({
  id: doc._id.toString(),
  firstName: doc.firstName,
  lastName: doc.lastName,
  email: doc.email,
  userName: doc.userName,
  phoneNumber: doc.phoneNumber ?? undefined,
  role: doc.role,
  emailVerified: doc.emailVerified,
  phoneVerified: doc.phoneVerified,
  mfaEnabled: doc.mfaEnabled === true,
});

const duplicateKeyFields = (error: unknown): string[] | null => {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== 11000) return null;
  const pattern = "keyPattern" in error && typeof error.keyPattern === "object" && error.keyPattern !== null ? Object.keys(error.keyPattern) : [];
  return pattern;
};

export class AuthService {
  private readonly redis: Redis;
  readonly policies: Record<AuthScope, ScopePolicy>;
  private readonly attempts: RedisRateLimitStore;
  private readonly secrets: Record<AuthScope, string>;
  private readonly appUrls: Record<AuthScope, string>;
  private readonly logger: Logger;
  private readonly mailer: Mailer;
  private readonly audit: AuditRecorder;

  constructor(deps: AuthServiceDeps) {
    this.redis = deps.redis;
    this.policies = deps.policies;
    this.secrets = deps.secrets;
    this.appUrls = { user: deps.storefrontUrl, admin: deps.adminUrl };
    this.logger = deps.logger;
    this.mailer = deps.mailer;
    this.audit = deps.audit;
    this.attempts = new RedisRateLimitStore(deps.redis);
  }

  // ---------------------------------------------------------------- registration and email verification

  // Always answers the same way whether or not the email is already registered, so it can't be used to probe for accounts.
  // The new user cannot sign in until the emailed link is used.
  async register(input: RegisterUserInput, ctx: ClientContext): Promise<void> {
    const passwordHash = await hashPassword(input.password);

    if (await User.exists({ email: input.email })) return this.noticeAlreadyRegistered(input.email, ctx);

    let doc: UserDocument;
    try {
      const created = await User.create({ firstName: input.firstName, lastName: input.lastName, email: input.email, userName: input.userName, phoneNumber: input.phoneNumber, passwordHash, role: USER_ROLES.USER });
      doc = created.toObject();
    } catch (error) {
      const fields = duplicateKeyFields(error);
      if (fields?.includes("email")) return this.noticeAlreadyRegistered(input.email, ctx);
      // A taken username or phone number gets the same neutral answer (phone numbers are personal data). Only the owner of
      // the email address learns why, and the message does not say which of the two was taken.
      if (fields) return this.sendInBackground(detailsUnavailableEmail(input.email, input.firstName, `${this.appUrls.user}/register`));
      throw error;
    }

    this.record("register", { scope: "user", userId: doc._id.toString() }, ctx);
    await this.sendVerificationEmail(doc);
  }

  async verifyEmail(token: string, ctx: ClientContext): Promise<void> {
    const userId = await consumeOneTimeToken(this.redis, "verify-email", token);
    if (!userId) throw invalidToken();
    // The link can outlive its account (unverified accounts are deleted after a while), so a missing account is a dead link.
    const { matchedCount } = await User.updateOne({ _id: userId }, { $set: { emailVerified: true } });
    if (matchedCount === 0) throw invalidToken();
    this.record("email_verified", { scope: "user", userId }, ctx);
  }

  // Public and always answers the same. One request per cooldown and at most MAX_VERIFICATION_RESENDS emails per
  // RESEND_WINDOW_MS; asking again after that blocks the account, and the owner gets a reset link (resetting also verifies
  // the email). An account that is never verified is deleted by the TTL index on User, which frees the email again.
  async resendVerification(email: string, ctx: ClientContext): Promise<void> {
    if ((await this.attempts.increment(`resend:${sha256(email)}:${clientKey(ctx.ip)}`, 60 * 60 * 1000)).count > 10) return;

    const doc = await User.findOne({ email }).lean<UserDocument>();
    if (!doc || doc.emailVerified || !this.canUseScope(doc, "user") || isBlocked(doc)) return;
    const userId = doc._id.toString();
    if (!(await this.redis.set(`resend-cooldown:${userId}`, "1", "EX", RESEND_COOLDOWN_SEC, "NX"))) return;

    // INCR is atomic, so concurrent requests can never send more than the limit. The window starts at the first resend.
    if ((await this.attempts.increment(`resend-count:${userId}`, RESEND_WINDOW_MS)).count > MAX_VERIFICATION_RESENDS) {
      return this.blockAccount("user", doc, "verification", ctx);
    }
    return this.sendVerificationEmail(doc);
  }

  private async sendVerificationEmail(doc: UserDocument): Promise<void> {
    const token = await issueOneTimeToken(this.redis, "verify-email", doc._id.toString(), EMAIL_LINK_TTL_SEC.verify);
    this.sendInBackground(verificationEmail(doc.email, doc.firstName, `${this.appUrls.user}/verify-email?token=${token}`));
  }

  private noticeAlreadyRegistered(email: string, ctx: ClientContext): void {
    this.sendInBackground(alreadyRegisteredEmail(email, `${this.appUrls.user}/login`, `${this.appUrls.user}/forgot-password`));
    this.logger.info("Registration for an existing email", { ip: ctx.ip });
  }

  // ---------------------------------------------------------------- sign in

  // Customers sign in with email or username, and only after verifying their email. With `mfaEnabled` the password is only
  // the first step: a correct one emails a code and returns the challenge to answer.
  async login(identifier: string, password: string, ctx: ClientContext): Promise<AuthResult | MfaChallenge> {
    const { doc, failureKey } = await this.checkPassword("user", identifier, password, ctx);
    if (!doc.emailVerified) throw new HttpError(403, "EMAIL_NOT_VERIFIED", "Please verify your email address before signing in");
    if (doc.mfaEnabled) return this.startMfa("user", doc, failureKey);
    return this.finishLogin("user", doc, failureKey, ctx);
  }

  // Admins always need the code, whatever the flag says.
  async startAdminLogin(email: string, password: string, ctx: ClientContext): Promise<MfaChallenge> {
    const { doc, failureKey } = await this.checkPassword("admin", email, password, ctx);
    return this.startMfa("admin", doc, failureKey);
  }

  // Step 1 done: emails a one-time code and returns the challenge it belongs to.
  private async startMfa(scope: AuthScope, doc: UserDocument, failureKey: string): Promise<MfaChallenge> {
    const userId = doc._id.toString();
    if ((await this.attempts.increment(`mfa-code:${userId}`, FAILURE_WINDOW_MS)).count > MAX_CODE_REQUESTS) throw tooManyAttempts();
    await this.redis.del(failureKey);

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const challengeId = randomBytes(32).toString("base64url");
    await this.redis.hset(`adminlogin:${sha256(challengeId)}`, { userId, scope, codeHash: sha256(code), tries: "0" });
    await this.redis.expire(`adminlogin:${sha256(challengeId)}`, LOGIN_CODE_TTL_SEC);
    this.sendInBackground(loginCodeEmail(doc.email, doc.firstName, code, scope));
    return { challengeId };
  }

  // A new code for the same challenge, without typing the password again. The wrong-code count carries over (so resending
  // never buys extra guesses), it counts towards the code quota, and there is a short cooldown between sends.
  async resendLoginCode(scope: AuthScope, challengeId: string): Promise<void> {
    const key = `adminlogin:${sha256(challengeId)}`;
    const [userId, challengeScope] = await this.redis.hmget(key, "userId", "scope");
    if (!userId || challengeScope !== scope) throw new HttpError(401, "INVALID_MFA_CODE", "This sign-in attempt has expired. Please start again.");
    if (!(await this.redis.set(`${key}:resend`, "1", "EX", CODE_RESEND_COOLDOWN_SEC, "NX"))) throw new HttpError(429, "TOO_MANY_ATTEMPTS", "Please wait a moment before asking for another code.");
    if ((await this.attempts.increment(`mfa-code:${userId}`, FAILURE_WINDOW_MS)).count > MAX_CODE_REQUESTS) throw tooManyAttempts();

    const doc = await User.findById(userId).lean<UserDocument>();
    if (!doc || !this.canUseScope(doc, scope) || isBlocked(doc)) throw new HttpError(401, "INVALID_MFA_CODE", "This sign-in attempt has expired. Please start again.");
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    // Set together with a fresh TTL, so even a challenge that expired a moment ago never lingers without one.
    await this.redis.multi().hset(key, { codeHash: sha256(code) }).expire(key, LOGIN_CODE_TTL_SEC).exec();
    this.sendInBackground(loginCodeEmail(doc.email, doc.firstName, code, scope));
  }

  // Step 2: the code must match and is single use. The third wrong guess blocks the account for 24 hours (or until a reset).
  async completeMfaLogin(scope: AuthScope, challengeId: string, code: string, ctx: ClientContext): Promise<AuthResult> {
    const key = `adminlogin:${sha256(challengeId)}`;
    const [userId, challengeScope, codeHash] = await this.redis.hmget(key, "userId", "scope", "codeHash");
    if (!userId || !codeHash || challengeScope !== scope) throw new HttpError(401, "INVALID_MFA_CODE", "Invalid or expired code");
    // Only counts against a challenge that exists, so random ids can't litter Redis with TTL-less keys.
    const tries = await this.redis.hincrby(key, "tries", 1);

    const expected = Buffer.from(codeHash);
    const given = Buffer.from(sha256(code));
    if (tries > MAX_WRONG_ATTEMPTS || expected.length !== given.length || !timingSafeEqual(expected, given)) {
      this.record("mfa_failure", { scope, userId }, ctx);
      if (tries >= MAX_WRONG_ATTEMPTS) {
        await this.redis.del(key);
        const doc = await User.findById(userId).lean<UserDocument>();
        if (doc) await this.blockAccount(scope, doc, "mfa", ctx);
        throw accountBlocked();
      }
      throw new HttpError(401, "INVALID_MFA_CODE", "Invalid or expired code");
    }
    if ((await this.redis.del(key)) !== 1) throw new HttpError(401, "INVALID_MFA_CODE", "Invalid or expired code");

    const doc = await User.findById(userId).lean<UserDocument>();
    if (!doc || !this.canUseScope(doc, scope)) throw invalidCredentials();
    if (isBlocked(doc)) throw accountBlocked();
    return this.finishLogin(scope, doc, undefined, ctx);
  }

  // Wrong passwords are counted per identifier across every client: the third one within the window blocks the account.
  // An identifier with no account behind it is "blocked" the same way, so the answers never reveal whether an account exists.
  private async checkPassword(scope: AuthScope, identifier: string, password: string, ctx: ClientContext): Promise<{ doc: UserDocument; failureKey: string }> {
    const identifierHash = sha256(identifier);
    const failureKey = loginFailureKey(scope, identifier);
    const filter = scope === "user" && !identifier.includes("@") ? { userName: identifier } : { email: identifier };
    const doc = await User.findOne(filter).select("+passwordHash").lean<UserDocument>();
    // Always hashed, so a blocked or missing account answers in the same time as any other.
    const passwordMatches = await verifyPassword(password, doc?.passwordHash);

    // Blocked means blocked even with the right password, so guessing on a blocked account learns nothing.
    if ((doc && isBlocked(doc)) || (await this.redis.exists(identifierBlockKey(scope, identifier)))) {
      this.record("login_locked", { scope, identifierHash }, ctx);
      throw accountBlocked();
    }

    if (!doc || !passwordMatches || !this.canUseScope(doc, scope)) {
      const { count } = await this.attempts.increment(failureKey, FAILURE_WINDOW_MS);
      this.record("login_failure", { scope, identifierHash }, ctx);
      if (count < MAX_WRONG_ATTEMPTS) throw invalidCredentials();

      await this.redis.set(identifierBlockKey(scope, identifier), "1", "EX", BLOCK_TTL_SEC);
      // Only an account that could sign in here is blocked: a customer's password typed into the admin login blocks nothing.
      if (doc && this.canUseScope(doc, scope)) await this.blockAccount(scope, doc, "password", ctx);
      throw accountBlocked();
    }
    return { doc, failureKey };
  }

  private async finishLogin(scope: AuthScope, doc: UserDocument, failureKey: string | undefined, ctx: ClientContext): Promise<AuthResult> {
    if (failureKey) await this.redis.del(failureKey);
    await this.revokePresentedSession(scope, ctx.currentRefreshToken);
    const tokens = await this.startSession(scope, doc, ctx);
    await User.updateOne({ _id: doc._id }, { $set: { lastLoginAt: new Date() } });
    this.record("login_success", { scope, userId: doc._id.toString() }, ctx);
    return { user: toPublicUser(doc), tokens };
  }

  // Every refresh token is single-use: it is swapped for a new one. A token that was only just replaced (second tab,
  // lost response) gets the same replacement back; replaying an older one kills the session.
  async refresh(scope: AuthScope, presentedToken: unknown, ctx?: ClientContext): Promise<AuthResult> {
    const parsed = this.readRefreshToken(scope, presentedToken, false);
    if (!parsed) throw unauthenticated("SESSION_EXPIRED");

    // The JWT's own expiry is only an upper bound; the Redis session TTL is what enforces the absolute lifetime.
    const nextTokenId = newRefreshTokenId();
    const result = await rotateSession(this.redis, parsed.sessionId, scope, parsed.tokenId, nextTokenId, this.policies[scope].idleTtlSec * 1000);
    if (result.status === "reused") {
      this.logger.warn("Refresh token reuse detected; session revoked", { scope, session: sha256(parsed.sessionId).slice(0, 12) });
      this.record("refresh_reuse", { scope, userId: result.userId }, ctx);
    }
    if (result.status !== "rotated" && result.status !== "grace") throw unauthenticated("SESSION_EXPIRED");

    const doc = await User.findById(result.userId).lean<UserDocument>();
    if (!doc || !this.canUseScope(doc, scope) || isBlocked(doc)) {
      await revokeSession(this.redis, parsed.sessionId);
      throw unauthenticated("SESSION_EXPIRED");
    }

    const accessToken = signAccessToken({ userId: result.userId, role: doc.role, sessionId: parsed.sessionId, scope }, this.secrets[scope], this.policies[scope].accessTtlSec);
    // Redis only ever holds token ids, so inside the grace window the replacement is signed again with the id issued last time.
    const tokenId = result.status === "grace" ? result.tokenId : nextTokenId;
    const refreshToken = signRefreshToken({ userId: parsed.userId, sessionId: parsed.sessionId, tokenId, scope }, this.secrets[scope], this.policies[scope].sessionTtlSec);
    return { user: toPublicUser(doc), tokens: { accessToken, refreshToken, refreshMaxAgeMs: result.ttlMs } };
  }

  async logout(scope: AuthScope, presentedToken: unknown, ctx?: ClientContext): Promise<void> {
    // Signs out whatever the cookie names, even if it has expired; the user is only recorded when the signature checks out.
    const userId = await this.revokePresentedSession(scope, presentedToken);
    this.record("logout", { scope, ...(userId ? { userId } : {}) }, ctx);
  }

  async logoutAll(scope: AuthScope, userId: string, ctx?: ClientContext): Promise<void> {
    await revokeAllUserSessions(this.redis, userId);
    this.record("logout_all", { scope, userId }, ctx);
  }

  // Checks the JWT *and* that its session is still live, so logout and revocation take effect immediately.
  async authenticate(scope: AuthScope, token: unknown): Promise<AccessClaims> {
    if (typeof token !== "string" || token.length === 0) throw unauthenticated();

    let claims: AccessClaims;
    try {
      claims = verifyAccessToken(token, this.secrets[scope], scope);
    } catch (error) {
      throw unauthenticated(isTokenExpiredError(error) ? "TOKEN_EXPIRED" : "UNAUTHENTICATED");
    }

    const session = await getSession(this.redis, claims.sessionId);
    if (!session || session.scope !== scope || session.userId !== claims.userId) throw unauthenticated();
    if (!this.policies[scope].allowedRoles.includes(claims.role)) throw new HttpError(403, "FORBIDDEN", "You do not have access to this resource");
    // Checked on every request, so a suspended, blocked or deleted account loses access immediately, not at token expiry.
    if (!(await User.exists({ _id: claims.userId, status: USER_STATUSES.ACTIVE, blockedUntil: notBlocked() }))) throw unauthenticated();
    return claims;
  }

  async getCurrentUser(scope: AuthScope, claims: AccessClaims): Promise<{ user: PublicUser }> {
    const doc = await User.findById(claims.userId).lean<UserDocument>();
    if (!doc || !this.canUseScope(doc, scope)) throw unauthenticated();
    return { user: toPublicUser(doc) };
  }

  // Hook for a future admin tool: a suspended or deleted account loses every session immediately.
  async setUserStatus(userId: string, status: UserStatus, actor?: { userId: string }): Promise<void> {
    await User.updateOne({ _id: userId }, { $set: { status } });
    if (status !== USER_STATUSES.ACTIVE) await revokeAllUserSessions(this.redis, userId);
    this.audit.record("user_status_changed", { userId, meta: { status, actor: actor?.userId } });
  }

  // ---------------------------------------------------------------- password management

  // Always answers the same way, whether or not the email belongs to an account. Works for blocked accounts: resetting is
  // how their owner unblocks them.
  async forgotPassword(scope: AuthScope, email: string, ctx: ClientContext): Promise<void> {
    const hit = await this.attempts.increment(`fp:${scope}:${sha256(email)}:${clientKey(ctx.ip)}`, 60 * 60 * 1000);
    if (hit.count > 5) return;

    const doc = await User.findOne({ email }).lean<UserDocument>();
    if (!doc || !this.canUseScope(doc, scope)) return;
    this.sendInBackground(passwordResetEmail(doc.email, doc.firstName, await this.resetLink(scope, doc)));
    this.record("password_reset_requested", { scope, userId: doc._id.toString() }, ctx);
  }

  // Following the emailed link proves the mailbox: it verifies the email, lifts any block and signs out everywhere.
  async resetPassword(scope: AuthScope, token: string, newPassword: string, ctx: ClientContext): Promise<void> {
    const userId = await consumeOneTimeToken(this.redis, RESET_KIND[scope], token);
    if (!userId) throw invalidToken();
    const doc = await User.findById(userId).lean<UserDocument>();
    if (!doc || !this.canUseScope(doc, scope)) throw invalidToken();

    await User.updateOne({ _id: doc._id }, { $set: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date(), emailVerified: true, blockedUntil: null, blockedReason: null } });
    await this.redis.del(...accountBlockKeys(doc));
    await revokeAllUserSessions(this.redis, userId);
    this.sendInBackground(passwordChangedEmail(doc.email, doc.firstName));
    this.record("password_reset_completed", { scope, userId }, ctx);
    if (isBlocked(doc)) this.record("account_unblocked", { scope, userId, meta: { reason: doc.blockedReason } }, ctx);
  }

  // Signs every other device out and gives this browser a fresh session. The third wrong current password blocks the account.
  async changePassword(scope: AuthScope, claims: AccessClaims, currentPassword: string, newPassword: string, ctx: ClientContext): Promise<AuthResult> {
    if (currentPassword === newPassword) throw new HttpError(400, "SAME_PASSWORD", "Choose a password different from your current one");
    const doc = await this.confirmCurrentPassword(scope, claims, currentPassword, ctx);

    await User.updateOne({ _id: doc._id }, { $set: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() } });
    await revokeAllUserSessions(this.redis, claims.userId);
    this.sendInBackground(passwordChangedEmail(doc.email, doc.firstName));
    this.record("password_changed", { scope, userId: claims.userId }, ctx);
    return { user: toPublicUser(doc), tokens: await this.startSession(scope, doc, ctx) };
  }

  // Customers choose whether signing in also needs an emailed code (admins always need it). The owner is told either way.
  async setMfa(claims: AccessClaims, enabled: boolean, currentPassword: string, ctx: ClientContext): Promise<{ user: PublicUser }> {
    const doc = await this.confirmCurrentPassword("user", claims, currentPassword, ctx);
    if (doc.mfaEnabled === enabled) return { user: toPublicUser(doc) };

    await User.updateOne({ _id: doc._id }, { $set: { mfaEnabled: enabled } });
    this.sendInBackground(mfaChangedEmail(doc.email, doc.firstName, enabled));
    this.record(enabled ? "mfa_enabled" : "mfa_disabled", { scope: "user", userId: claims.userId }, ctx);
    return { user: toPublicUser({ ...doc, mfaEnabled: enabled }) };
  }

  // ---------------------------------------------------------------- internals

  // Re-authentication for sensitive changes by a signed-in user. The third wrong password blocks the account and ends
  // every session, so a stolen session can't be used to guess the password.
  private async confirmCurrentPassword(scope: AuthScope, claims: AccessClaims, password: string, ctx: ClientContext): Promise<UserDocument> {
    const failureKey = `lf:cp:${claims.userId}`;
    const doc = await User.findById(claims.userId).select("+passwordHash").lean<UserDocument>();
    if (!doc || !this.canUseScope(doc, scope)) throw unauthenticated();
    if (!(await verifyPassword(password, doc.passwordHash))) {
      if ((await this.attempts.increment(failureKey, FAILURE_WINDOW_MS)).count < MAX_WRONG_ATTEMPTS) throw new HttpError(401, "INVALID_CREDENTIALS", "Current password is incorrect");
      await this.blockAccount(scope, doc, "password", ctx);
      throw accountBlocked();
    }
    await this.redis.del(failureKey);
    return doc;
  }

  // Blocks sign-in for BLOCK_TTL_SEC, signs out every device and emails the owner a reset link that lifts the block.
  // The conditional update makes concurrent triggers block (and email) only once.
  private async blockAccount(scope: AuthScope, doc: UserDocument, reason: BlockReason, ctx?: ClientContext): Promise<void> {
    const userId = doc._id.toString();
    const blockedUntil = new Date(Date.now() + BLOCK_TTL_SEC * 1000);
    const { modifiedCount } = await User.updateOne({ _id: doc._id, blockedUntil: notBlocked() }, { $set: { blockedUntil, blockedReason: reason } });
    if (modifiedCount === 0) return;

    await revokeAllUserSessions(this.redis, userId);
    this.sendInBackground(accountBlockedEmail(doc.email, doc.firstName, reason, await this.resetLink(scope, doc), `${this.appUrls[scope]}/forgot-password`));
    this.record("account_blocked", { scope, userId, meta: { reason } }, ctx);
  }

  // Issuing a link invalidates the previous one for that account.
  private async resetLink(scope: AuthScope, doc: UserDocument): Promise<string> {
    const token = await issueOneTimeToken(this.redis, RESET_KIND[scope], doc._id.toString(), EMAIL_LINK_TTL_SEC.reset);
    return `${this.appUrls[scope]}/reset-password?token=${token}`;
  }

  private canUseScope(doc: Pick<IUser, "role" | "status">, scope: AuthScope): boolean {
    return doc.status === USER_STATUSES.ACTIVE && this.policies[scope].allowedRoles.includes(doc.role);
  }

  private async startSession(scope: AuthScope, doc: UserDocument, ctx: ClientContext): Promise<IssuedTokens> {
    const policy = this.policies[scope];
    const userId = doc._id.toString();
    const sessionId = newSessionId();
    const tokenId = newRefreshTokenId();

    await createSession(this.redis, sessionId, { userId, scope, refreshTokenId: tokenId, userAgent: ctx.userAgent.slice(0, 256), ip: ctx.ip }, policy.sessionTtlSec);

    const accessToken = signAccessToken({ userId, role: doc.role, sessionId, scope }, this.secrets[scope], policy.accessTtlSec);
    const refreshToken = signRefreshToken({ userId, sessionId, tokenId, scope }, this.secrets[scope], policy.sessionTtlSec);
    return { accessToken, refreshToken, refreshMaxAgeMs: policy.sessionTtlSec * 1000 };
  }

  private async revokePresentedSession(scope: AuthScope, presentedToken: unknown): Promise<string | undefined> {
    // An expired or other-scope cookie may still name a live session; expired ones are honoured here, forged ones are not.
    const parsed = this.readRefreshToken(scope, presentedToken, true);
    if (!parsed) return undefined;
    await revokeSession(this.redis, parsed.sessionId);
    return parsed.userId;
  }

  private readRefreshToken(scope: AuthScope, token: unknown, ignoreExpiration: boolean): ReturnType<typeof verifyRefreshToken> | null {
    if (typeof token !== "string" || token.length === 0) return null;
    try {
      return verifyRefreshToken(token, this.secrets[scope], scope, { ignoreExpiration });
    } catch {
      return null;
    }
  }

  // Not awaited by callers: delivery time must not reveal whether an email was actually sent.
  private sendInBackground(mail: Parameters<Mailer["send"]>[0]): void {
    this.mailer.send(mail).catch((error: unknown) => this.logger.error("Failed to send email", { subject: mail.subject, error }));
  }

  private record(event: AuditEventName, entry: AuditEntry, ctx?: ClientContext): void {
    this.audit.record(event, { ...entry, ...(ctx ? { ip: ctx.ip, userAgent: ctx.userAgent.slice(0, 256) } : {}) });
  }
}
