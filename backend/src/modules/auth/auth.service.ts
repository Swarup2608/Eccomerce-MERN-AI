import type { Redis } from "ioredis";
import type { Types } from "mongoose";
import { HttpError } from "../../lib/http-error.js";
import type { Logger } from "../../lib/logger.js";
import { RedisRateLimitStore } from "../../middleware/rate-limit.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";
import { createSession, getSession, revokeAllUserSessions, revokeSession, rotateSession } from "../../utils/session-store.js";
import { formatRefreshToken, isTokenExpiredError, newRefreshSecret, newSessionId, parseRefreshToken, sha256, signAccessToken, verifyAccessToken } from "../../utils/tokens.js";
import type { AccessClaims } from "../../utils/tokens.js";
import { User, type IUser } from "../users/user.model.js";
import { USER_ROLES, USER_STATUSES, type RegisterUserInput, type UserRole } from "../users/user.validation.js";
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
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshMaxAgeMs: number;
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

type UserDocument = IUser & { _id: Types.ObjectId };

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

export const unauthenticated = (code = "UNAUTHENTICATED"): HttpError => new HttpError(401, code, "Authentication required");
const invalidCredentials = (): HttpError => new HttpError(401, "INVALID_CREDENTIALS", "Invalid credentials");

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
});

const isDuplicateKeyError = (error: unknown): boolean => typeof error === "object" && error !== null && "code" in error && error.code === 11000;

export class AuthService {
  private readonly attempts: RedisRateLimitStore;

  constructor(
    private readonly redis: Redis,
    readonly policies: Record<AuthScope, ScopePolicy>,
    private readonly secrets: Record<AuthScope, string>,
    private readonly logger: Logger,
  ) {
    this.attempts = new RedisRateLimitStore(redis);
  }

  async register(input: RegisterUserInput, ctx: ClientContext): Promise<AuthResult> {
    const passwordHash = await hashPassword(input.password);

    let doc: UserDocument;
    try {
      const created = await User.create({ firstName: input.firstName, lastName: input.lastName, email: input.email, userName: input.userName, phoneNumber: input.phoneNumber, passwordHash, role: USER_ROLES.USER });
      doc = created.toObject();
    } catch (error) {
      // Deliberately vague: don't confirm which email/username/phone is registered.
      if (isDuplicateKeyError(error)) throw new HttpError(409, "ACCOUNT_UNAVAILABLE", "An account with these details already exists");
      throw error;
    }

    this.logger.info("User registered", { userId: doc._id.toString() });
    await this.revokePresentedSession(ctx.currentRefreshToken);
    return { user: toPublicUser(doc), tokens: await this.startSession("user", doc, ctx) };
  }

  // Users sign in with email or username; admins with email only.
  async login(scope: AuthScope, identifier: string, password: string, ctx: ClientContext): Promise<AuthResult> {
    const attempt = await this.attempts.increment(`login:${scope}:${sha256(identifier)}`, LOGIN_WINDOW_MS);
    if (attempt.count > LOGIN_MAX_ATTEMPTS) throw new HttpError(429, "TOO_MANY_ATTEMPTS", "Too many sign-in attempts. Please try again later.");

    const filter = scope === "user" && !identifier.includes("@") ? { userName: identifier } : { email: identifier };
    const doc = await User.findOne(filter).select("+passwordHash").lean<UserDocument>();
    const passwordMatches = await verifyPassword(doc?.passwordHash, password);

    // One generic error for every failure, so responses never reveal whether an account exists.
    if (!doc || !passwordMatches || !this.canUseScope(doc, scope)) {
      this.logger.warn("Failed sign-in", { scope, ip: ctx.ip });
      throw invalidCredentials();
    }

    await this.revokePresentedSession(ctx.currentRefreshToken);
    const tokens = await this.startSession(scope, doc, ctx);
    await User.updateOne({ _id: doc._id }, { $set: { lastLoginAt: new Date() } });
    return { user: toPublicUser(doc), tokens };
  }

  // Every refresh token is single-use: it is swapped for a new one, and replaying an old one kills the session.
  async refresh(scope: AuthScope, presentedToken: unknown): Promise<AuthResult> {
    const parsed = parseRefreshToken(presentedToken);
    if (!parsed) throw unauthenticated("SESSION_EXPIRED");

    const nextSecret = newRefreshSecret();
    const result = await rotateSession(this.redis, parsed.sessionId, scope, sha256(parsed.secret), sha256(nextSecret));
    if (result.status === "reused") this.logger.warn("Refresh token reuse detected; session revoked", { scope, session: sha256(parsed.sessionId).slice(0, 12) });
    if (result.status !== "rotated") throw unauthenticated("SESSION_EXPIRED");

    const doc = await User.findById(result.userId).lean<UserDocument>();
    if (!doc || !this.canUseScope(doc, scope)) {
      await revokeSession(this.redis, parsed.sessionId);
      throw unauthenticated("SESSION_EXPIRED");
    }

    const accessToken = signAccessToken({ userId: result.userId, role: doc.role, sessionId: parsed.sessionId, scope }, this.secrets[scope], this.policies[scope].accessTtlSec);
    return { user: toPublicUser(doc), tokens: { accessToken, refreshToken: formatRefreshToken(parsed.sessionId, nextSecret), refreshMaxAgeMs: result.ttlMs } };
  }

  async logout(presentedToken: unknown): Promise<void> {
    await this.revokePresentedSession(presentedToken);
  }

  async logoutAll(userId: string): Promise<void> {
    await revokeAllUserSessions(this.redis, userId);
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
    return claims;
  }

  async getCurrentUser(scope: AuthScope, userId: string): Promise<PublicUser> {
    const doc = await User.findById(userId).lean<UserDocument>();
    if (!doc || !this.canUseScope(doc, scope)) throw unauthenticated();
    return toPublicUser(doc);
  }

  private canUseScope(doc: Pick<IUser, "role" | "status">, scope: AuthScope): boolean {
    return doc.status === USER_STATUSES.ACTIVE && this.policies[scope].allowedRoles.includes(doc.role);
  }

  private async startSession(scope: AuthScope, doc: UserDocument, ctx: ClientContext): Promise<IssuedTokens> {
    const policy = this.policies[scope];
    const userId = doc._id.toString();
    const sessionId = newSessionId();
    const refreshSecret = newRefreshSecret();

    await createSession(this.redis, sessionId, { userId, scope, refreshHash: sha256(refreshSecret), userAgent: ctx.userAgent.slice(0, 256), ip: ctx.ip }, policy.sessionTtlSec);

    const accessToken = signAccessToken({ userId, role: doc.role, sessionId, scope }, this.secrets[scope], policy.accessTtlSec);
    return { accessToken, refreshToken: formatRefreshToken(sessionId, refreshSecret), refreshMaxAgeMs: policy.sessionTtlSec * 1000 };
  }

  private async revokePresentedSession(presentedToken: unknown): Promise<void> {
    const parsed = parseRefreshToken(presentedToken);
    if (parsed) await revokeSession(this.redis, parsed.sessionId);
  }
}
