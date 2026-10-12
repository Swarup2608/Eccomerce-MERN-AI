import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { hashPassword } from "../utils/password.js";
import { USER_ROLES, USER_STATUSES } from "../modules/users/user.validation.js";
import { UNVERIFIED_ACCOUNT_TTL_SEC, User } from "../modules/users/user.model.js";
import jwt from "jsonwebtoken";
import { sha256 } from "../utils/tokens.js";
import { ADMIN_ORIGIN, Client, hasInfra, startApp, startInfra, type Infra, type TestApp } from "./helpers/harness.js";

// These run the real Express app against real Redis and MongoDB processes, so they need redis-server and mongod on PATH.
const suite = hasInfra() ? describe : describe.skip;

const PASSWORD = "Str0ng&Unusual1";
const NEW_PASSWORD = "An0ther&Strong2";
let infra: Infra;
let app: TestApp;
let counter = 0;

before(async () => {
  if (!hasInfra()) return;
  infra = await startInfra();
  app = await startApp(infra.redis);
});

after(async () => {
  if (!hasInfra()) return;
  await app.stop();
  await infra.stop();
});

const unique = (prefix: string): string => `${prefix}${(counter += 1)}${Date.now().toString(36)}`;

async function registerAndVerify(client = new Client(app.baseUrl)): Promise<{ client: Client; email: string; userName: string }> {
  const userName = unique("user");
  const email = `${userName}@example.com`;
  const res = await client.post("/api/v1/auth/register", { firstName: "Test", lastName: "User", email, userName, password: PASSWORD });
  assert.equal(res.status, 202);
  const verified = await client.post("/api/v1/auth/verify-email", { token: app.mailer.tokenFor(email) });
  assert.equal(verified.status, 204);
  return { client, email, userName };
}

async function createAdmin(): Promise<{ email: string; id: string }> {
  const email = `${unique("admin")}@example.com`;
  const doc = await User.create({ firstName: "Ad", lastName: "Min", email, userName: unique("root"), passwordHash: await hashPassword(PASSWORD), role: USER_ROLES.ADMIN, emailVerified: true });
  return { email, id: doc._id.toString() };
}

// Password step, then the emailed code.
async function adminLogin(client: Client, email: string, password = PASSWORD) {
  const first = await client.post("/api/v1/admin/auth/login", { email, password });
  if (first.status !== 202) return first;
  const code = /\b(\d{6})\b/.exec(app.mailer.last(email)?.text ?? "")?.[1];
  assert.ok(code, "code was emailed");
  return client.post("/api/v1/admin/auth/login/verify", { challengeId: first.body.challengeId, code });
}

suite("customer registration and email verification", () => {
  it("creates no session until the email is verified", async () => {
    const client = new Client(app.baseUrl);
    const userName = unique("reg");
    const email = `${userName}@example.com`;
    const res = await client.post("/api/v1/auth/register", { firstName: "A", lastName: "B", email, userName, password: PASSWORD });
    assert.equal(res.status, 202);
    assert.equal(client.jar.size, 0);
    assert.match(app.mailer.last(email)?.subject ?? "", /Verify/);

    const early = await client.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    assert.equal(early.status, 403);
    assert.equal(early.body.error.code, "EMAIL_NOT_VERIFIED");

    const token = app.mailer.tokenFor(email);
    assert.equal((await client.post("/api/v1/auth/verify-email", { token })).status, 204);
    assert.equal((await client.post("/api/v1/auth/verify-email", { token })).body.error.code, "INVALID_TOKEN", "links are single use");

    const login = await client.post("/api/v1/auth/login", { identifier: userName, password: PASSWORD });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.emailVerified, true);
    assert.equal((await client.get("/api/v1/auth/me")).body.user.email, email);
  });

  it("answers identically for an email that is already registered", async () => {
    const { email } = await registerAndVerify();
    const before = app.mailer.sent.length;
    const res = await new Client(app.baseUrl).post("/api/v1/auth/register", { firstName: "X", lastName: "Y", email, userName: unique("other"), password: PASSWORD });
    assert.equal(res.status, 202);
    assert.deepEqual(res.body, { status: "verification_sent" });
    assert.match(app.mailer.sent[before]?.subject ?? "", /Someone tried/);
    assert.equal(await User.countDocuments({ email }), 1);
  });

  it("rejects weak passwords, reserved usernames and role injection", async () => {
    const c = new Client(app.baseUrl);
    const base = { firstName: "A", lastName: "B", email: `${unique("w")}@example.com`, userName: unique("w"), password: PASSWORD };
    assert.equal((await c.post("/api/v1/auth/register", { ...base, password: "password" })).status, 400);
    assert.equal((await c.post("/api/v1/auth/register", { ...base, userName: "admin" })).status, 400);
    assert.equal((await c.post("/api/v1/auth/register", { ...base, role: "admin" })).status, 400);
  });

  it("answers a taken username or phone number neutrally, and only tells the mailbox owner", async () => {
    const phoneNumber = `+9198${String(Date.now()).slice(-8)}`;
    const first = await new Client(app.baseUrl).post("/api/v1/auth/register", { firstName: "A", lastName: "B", email: `${unique("p")}@example.com`, userName: unique("p"), password: PASSWORD, phoneNumber });
    assert.equal(first.status, 202);
    const { userName } = await registerAndVerify();

    for (const clash of [{ userName }, { userName: unique("q"), phoneNumber }]) {
      const email = `${unique("n")}@example.com`;
      const res = await new Client(app.baseUrl).post("/api/v1/auth/register", { firstName: "A", lastName: "B", email, password: PASSWORD, ...clash });
      assert.equal(res.status, 202, "same answer as a successful sign-up");
      assert.deepEqual(res.body, { status: "verification_sent" });
      assert.equal(await User.exists({ email }), null);
      assert.match(app.mailer.last(email)?.subject ?? "", /could not create/);
      assert.equal((await new Client(app.baseUrl).post("/api/v1/auth/login", { identifier: email, password: PASSWORD })).body.error.code, "INVALID_CREDENTIALS");
    }
  });

  it("resends the verification email with a cooldown, then blocks the account until the owner resets", async () => {
    const client = new Client(app.baseUrl);
    const userName = unique("rs");
    const email = `${userName}@example.com`;
    await client.post("/api/v1/auth/register", { firstName: "A", lastName: "B", email, userName, password: PASSWORD });
    const doc = await User.findOne({ email }).lean();
    assert.ok(doc);
    const count = () => app.mailer.sent.filter((mail) => mail.to === email).length;
    const resend = async () => {
      const res = await client.post("/api/v1/auth/resend-verification", { email });
      assert.equal(res.status, 202);
    };
    const waitOutCooldown = () => infra.redis.del(`resend-cooldown:${doc._id.toString()}`);

    assert.equal(count(), 1);
    await resend();
    assert.equal(count(), 2);
    await resend();
    assert.equal(count(), 2, "a second request inside the cooldown sends nothing");
    for (const expected of [3, 4]) {
      await waitOutCooldown();
      await resend();
      assert.equal(count(), expected);
    }

    await waitOutCooldown();
    await resend();
    const blocked = await User.findById(doc._id).lean();
    assert.equal(blocked?.status, "active", "a temporary block, not a suspension");
    assert.equal(blocked?.blockedReason, "verification");
    assert.ok(blocked?.blockedUntil && blocked.blockedUntil.getTime() > Date.now() + 23 * 3600_000);
    assert.match(app.mailer.last(email)?.subject ?? "", /blocked/);
    await waitOutCooldown();
    await resend();
    assert.equal(count(), 5, "nothing more is sent while blocked");

    // The block email carries a reset link: using it verifies the email, lifts the block and the owner can sign in.
    const guest = new Client(app.baseUrl);
    assert.equal((await guest.post("/api/v1/auth/reset-password", { token: app.mailer.tokenFor(email), password: NEW_PASSWORD })).status, 204);
    const after = await User.findById(doc._id).lean();
    assert.equal(after?.blockedUntil, null);
    assert.equal(after?.emailVerified, true);
    assert.equal((await guest.post("/api/v1/auth/login", { identifier: email, password: NEW_PASSWORD })).status, 200);
    assert.ok(app.audit.count("account_unblocked") >= 1);
  });

  it("deletes accounts that stay unverified, so the email can be registered again", async () => {
    const ttl = (await User.collection.indexes()).find((index) => index.expireAfterSeconds !== undefined);
    assert.equal(ttl?.expireAfterSeconds, UNVERIFIED_ACCOUNT_TTL_SEC);
    assert.deepEqual(ttl?.partialFilterExpression, { emailVerified: false });

    const client = new Client(app.baseUrl);
    const userName = unique("ttl");
    const email = `${userName}@example.com`;
    await client.post("/api/v1/auth/register", { firstName: "A", lastName: "B", email, userName, password: PASSWORD });
    const staleToken = app.mailer.tokenFor(email);
    await User.deleteOne({ email }); // what the TTL monitor does after UNVERIFIED_ACCOUNT_TTL_SEC
    assert.equal((await client.post("/api/v1/auth/verify-email", { token: staleToken })).status, 400, "a link to a deleted account is dead");

    assert.equal((await client.post("/api/v1/auth/register", { firstName: "A", lastName: "B", email, userName, password: PASSWORD })).status, 202);
    assert.match(app.mailer.last(email)?.subject ?? "", /Verify/);
  });

  it("answers the same for unknown and already verified emails", async () => {
    const { email } = await registerAndVerify();
    const before = app.mailer.sent.length;
    const c = new Client(app.baseUrl);
    assert.equal((await c.post("/api/v1/auth/resend-verification", { email })).status, 202);
    assert.equal((await c.post("/api/v1/auth/resend-verification", { email: `${unique("none")}@example.com` })).status, 202);
    assert.equal(app.mailer.sent.length, before);
  });
});

suite("customer sign-in with an emailed code (mfaEnabled)", () => {
  it("needs the emailed code, and blocks the account after three wrong ones", async () => {
    const { email } = await registerAndVerify();
    await User.updateOne({ email }, { $set: { mfaEnabled: true } });

    const c = new Client(app.baseUrl);
    const first = await c.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    assert.equal(first.status, 202);
    assert.equal(first.body.status, "mfa_required");
    assert.equal(first.body.user, undefined, "no session before the code");
    const code = /\b(\d{6})\b/.exec(app.mailer.last(email)?.text ?? "")?.[1] ?? "";
    const ok = await c.post("/api/v1/auth/login/verify", { challengeId: first.body.challengeId, code });
    assert.equal(ok.status, 200);

    const second = await new Client(app.baseUrl).post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    const real = /\b(\d{6})\b/.exec(app.mailer.last(email)?.text ?? "")?.[1] ?? "";
    const wrong = real === "000000" ? "111111" : "000000";
    const bad = new Client(app.baseUrl);
    for (let i = 0; i < 2; i += 1) assert.equal((await bad.post("/api/v1/auth/login/verify", { challengeId: second.body.challengeId, code: wrong })).status, 401);
    assert.equal((await bad.post("/api/v1/auth/login/verify", { challengeId: second.body.challengeId, code: wrong })).status, 403);
    assert.equal((await c.get("/api/v1/auth/me")).status, 401, "every device was signed out");
    const retry = await new Client(app.baseUrl).post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    assert.equal(retry.status, 403);
    assert.equal(retry.body.error.code, "ACCOUNT_BLOCKED");
    assert.equal((await User.findOne({ email }).lean())?.blockedReason, "mfa");
  });

  it("does not use an admin challenge on the customer endpoint", async () => {
    const { email } = await createAdmin();
    const { body } = await new Client(app.baseUrl).post("/api/v1/admin/auth/login", { email, password: PASSWORD });
    const code = /\b(\d{6})\b/.exec(app.mailer.last(email)?.text ?? "")?.[1] ?? "";
    assert.equal((await new Client(app.baseUrl).post("/api/v1/auth/login/verify", { challengeId: body.challengeId, code })).status, 401);
  });
});

suite("customer sign-in, lockout and sessions", () => {
  it("gives the same error for a wrong password and an unknown account", async () => {
    const { email } = await registerAndVerify();
    const c = new Client(app.baseUrl);
    const wrong = await c.post("/api/v1/auth/login", { identifier: email, password: NEW_PASSWORD });
    const unknown = await c.post("/api/v1/auth/login", { identifier: "nobody@example.com", password: NEW_PASSWORD });
    assert.equal(wrong.status, 401);
    assert.deepEqual(wrong.body.error.code, unknown.body.error.code);
  });

  it("blocks the account after three wrong passwords from any clients, until the owner resets it", async () => {
    const { client: owner, email, userName } = await registerAndVerify();
    await owner.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    const wrong = (identifier: string) => new Client(app.baseUrl).post("/api/v1/auth/login", { identifier, password: NEW_PASSWORD });
    assert.equal((await wrong(email)).status, 401);
    assert.equal((await wrong(email)).status, 401);
    const third = await wrong(email);
    assert.equal(third.status, 403);
    assert.equal(third.body.error.code, "ACCOUNT_BLOCKED");

    assert.equal((await owner.get("/api/v1/auth/me")).status, 401, "every device was signed out");
    for (const identifier of [email, userName]) {
      const res = await new Client(app.baseUrl).post("/api/v1/auth/login", { identifier, password: PASSWORD });
      assert.equal(res.status, 403, "blocked even with the right password, by email or username");
    }
    assert.match(app.mailer.last(email)?.subject ?? "", /blocked for 24 hours/);

    const guest = new Client(app.baseUrl);
    assert.equal((await guest.post("/api/v1/auth/reset-password", { token: app.mailer.tokenFor(email), password: NEW_PASSWORD })).status, 204);
    assert.equal((await guest.post("/api/v1/auth/login", { identifier: userName, password: NEW_PASSWORD })).status, 200);
  });

  it("answers an unknown identifier the same way once it has had three wrong passwords", async () => {
    const ghost = `${unique("ghost")}@example.com`;
    const tries = [];
    for (let i = 0; i < 4; i += 1) tries.push(await new Client(app.baseUrl).post("/api/v1/auth/login", { identifier: ghost, password: NEW_PASSWORD }));
    assert.deepEqual(tries.map((res) => res.status), [401, 401, 403, 403]);
    assert.equal(tries[3]?.body.error.code, "ACCOUNT_BLOCKED");
  });

  it("lifts the block on its own after 24 hours", async () => {
    const { email } = await registerAndVerify();
    for (let i = 0; i < 3; i += 1) await new Client(app.baseUrl).post("/api/v1/auth/login", { identifier: email, password: NEW_PASSWORD });
    // Fast-forward: the Mongo block has expired and the Redis identifier block has hit its TTL.
    await User.updateOne({ email }, { $set: { blockedUntil: new Date(Date.now() - 1000) } });
    await infra.redis.del(`blk:user:${sha256(email)}`, `lf:user:${sha256(email)}`);
    assert.equal((await new Client(app.baseUrl).post("/api/v1/auth/login", { identifier: email, password: PASSWORD })).status, 200);
  });

  it("keeps the strict limit off session endpoints, so browsing never hits it", async () => {
    const { client, email } = await registerAndVerify();
    await client.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    for (let i = 0; i < 60; i += 1) assert.equal((await client.get("/api/v1/auth/me")).status, 200);

    const prober = new Client(app.baseUrl);
    const statuses = [];
    for (let i = 0; i < 51; i += 1) statuses.push((await prober.post("/api/v1/auth/verify-email", { token: "A".repeat(43) })).status);
    assert.equal(statuses.at(-1), 429, "credential endpoints still are");
  });

  it("does not count successful logins towards the lockout", async () => {
    const { email } = await registerAndVerify();
    const c = new Client(app.baseUrl);
    for (let i = 0; i < 15; i += 1) assert.equal((await c.post("/api/v1/auth/login", { identifier: email, password: PASSWORD })).status, 200);
  });

  it("rotates refresh tokens and survives a replay inside the grace window", async () => {
    const { client, email } = await registerAndVerify();
    await client.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    const original = client.cookie("sf_refresh");
    assert.ok(original);

    const first = await client.post("/api/v1/auth/refresh");
    assert.equal(first.status, 200);
    const rotated = client.cookie("sf_refresh");
    assert.notEqual(rotated, original);

    // A second tab (or a retry after a lost response) still holding the old token gets the same new one, not a logout.
    const second = new Client(app.baseUrl);
    second.setCookie("sf_refresh", original, "/api/v1/auth");
    assert.equal((await second.post("/api/v1/auth/refresh")).status, 200);
    assert.equal(second.cookie("sf_refresh"), rotated);
    assert.equal((await client.post("/api/v1/auth/refresh")).status, 200, "the session is still alive");
  });

  it("revokes the session when an old token is replayed after the grace window", async () => {
    const { client, email } = await registerAndVerify();
    await client.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    const stolen = client.cookie("sf_refresh");
    assert.ok(stolen);
    await client.post("/api/v1/auth/refresh");
    await infra.redis.del(`ecommerce:session:grace:${(jwt.decode(stolen) as { sid: string }).sid}`);

    const thief = new Client(app.baseUrl);
    thief.setCookie("sf_refresh", stolen, "/api/v1/auth");
    assert.equal((await thief.post("/api/v1/auth/refresh")).status, 401);
    assert.equal((await client.post("/api/v1/auth/refresh")).status, 401, "the real user's session was destroyed too");
    assert.ok(app.audit.count("refresh_reuse") >= 1);
  });

  it("makes logout effective immediately, even for a still-valid access token", async () => {
    const { client, email } = await registerAndVerify();
    await client.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    const access = client.cookie("sf_access");
    assert.ok(access);
    const refresh = client.cookie("sf_refresh");
    assert.ok(refresh);
    assert.equal((await client.post("/api/v1/auth/logout")).status, 204);

    const replay = new Client(app.baseUrl);
    replay.setCookie("sf_access", access, "/api/v1");
    assert.equal((await replay.get("/api/v1/auth/me")).status, 401);
    replay.setCookie("sf_refresh", refresh, "/api/v1/auth");
    assert.equal((await replay.post("/api/v1/auth/refresh")).status, 401);
  });

  it("logout-all ends every device", async () => {
    const { client, email } = await registerAndVerify();
    const other = new Client(app.baseUrl);
    await client.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    await other.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    assert.equal((await client.post("/api/v1/auth/logout-all")).status, 204);
    assert.equal((await other.get("/api/v1/auth/me")).status, 401);
  });

  it("revokes sessions and blocks sign-in when an account is suspended", async () => {
    const { client, email } = await registerAndVerify();
    await client.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    const doc = await User.findOne({ email }).lean();
    assert.ok(doc);
    await app.service.setUserStatus(doc._id.toString(), USER_STATUSES.SUSPENDED);
    assert.equal((await client.get("/api/v1/auth/me")).status, 401);
    assert.equal((await new Client(app.baseUrl).post("/api/v1/auth/login", { identifier: email, password: PASSWORD })).status, 401);
  });

  it("never lets a customer reach the admin API", async () => {
    const { client, email } = await registerAndVerify();
    await client.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    assert.equal((await client.get("/api/v1/admin/auth/me")).status, 401);
    assert.equal((await client.post("/api/v1/admin/auth/login", { email, password: PASSWORD })).status, 401);
  });
});

suite("password reset and change", () => {
  it("answers the same for unknown emails and sends nothing", async () => {
    const before = app.mailer.sent.length;
    const res = await new Client(app.baseUrl).post("/api/v1/auth/forgot-password", { email: "ghost@example.com" });
    assert.equal(res.status, 202);
    assert.equal(app.mailer.sent.length, before);
  });

  it("resets with a single-use link, signs out every device and verifies the mailbox", async () => {
    const { client, email } = await registerAndVerify();
    await client.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    assert.equal((await new Client(app.baseUrl).post("/api/v1/auth/forgot-password", { email })).status, 202);
    const token = app.mailer.tokenFor(email);

    const guest = new Client(app.baseUrl);
    assert.equal((await guest.post("/api/v1/auth/reset-password", { token, password: "weak" })).status, 400);
    assert.equal((await guest.post("/api/v1/auth/reset-password", { token, password: NEW_PASSWORD })).status, 204);
    assert.equal((await guest.post("/api/v1/auth/reset-password", { token, password: NEW_PASSWORD })).status, 400, "single use");

    assert.equal((await client.get("/api/v1/auth/me")).status, 401, "old sessions are gone");
    assert.equal((await guest.post("/api/v1/auth/login", { identifier: email, password: PASSWORD })).status, 401);
    assert.equal((await guest.post("/api/v1/auth/login", { identifier: email, password: NEW_PASSWORD })).status, 200);
    assert.match(app.mailer.last(email)?.subject ?? "", /changed/);
  });

  it("only honours the newest reset link", async () => {
    const { email } = await registerAndVerify();
    const c = new Client(app.baseUrl);
    await c.post("/api/v1/auth/forgot-password", { email });
    const older = app.mailer.tokenFor(email);
    await c.post("/api/v1/auth/forgot-password", { email });
    assert.equal((await c.post("/api/v1/auth/reset-password", { token: older, password: NEW_PASSWORD })).status, 400);
  });

  it("changes a password: needs the current one, signs out other devices, keeps this one", async () => {
    const { client, email } = await registerAndVerify();
    const other = new Client(app.baseUrl);
    await client.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    await other.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });

    assert.equal((await client.post("/api/v1/auth/change-password", { currentPassword: NEW_PASSWORD, newPassword: "Th1rd&Strong3" })).status, 401);
    assert.equal((await client.post("/api/v1/auth/change-password", { currentPassword: PASSWORD, newPassword: PASSWORD })).status, 400);
    assert.equal((await client.post("/api/v1/auth/change-password", { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status, 200);

    assert.equal((await other.get("/api/v1/auth/me")).status, 401);
    assert.equal((await client.get("/api/v1/auth/me")).status, 200);
    assert.equal((await new Client(app.baseUrl).post("/api/v1/auth/login", { identifier: email, password: PASSWORD })).status, 401);
    const doc = await User.findOne({ email }).lean();
    assert.ok(doc?.passwordChangedAt);
  });

  it("blocks the account after three wrong current passwords", async () => {
    const { client, email } = await registerAndVerify();
    await client.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    const attempt = () => client.post("/api/v1/auth/change-password", { currentPassword: "Wr0ng&Guess99", newPassword: NEW_PASSWORD });
    assert.equal((await attempt()).status, 401);
    assert.equal((await attempt()).status, 401);
    assert.equal((await attempt()).status, 403);
    assert.equal((await client.get("/api/v1/auth/me")).status, 401, "the session used for guessing is gone");
    assert.equal((await new Client(app.baseUrl).post("/api/v1/auth/login", { identifier: email, password: PASSWORD })).status, 403);
  });
});

suite("admin sign-in with an emailed code", () => {
  it("gives no session after the password alone", async () => {
    const { email } = await createAdmin();
    const c = new Client(app.baseUrl);
    const res = await c.post("/api/v1/admin/auth/login", { email, password: PASSWORD });
    assert.equal(res.status, 202);
    assert.equal(c.jar.size, 0);
    assert.equal((await c.get("/api/v1/admin/auth/me")).status, 401);
    assert.match(app.mailer.last(email)?.text ?? "", /\b\d{6}\b/);
  });

  it("signs in with the right code and can then use the admin API", async () => {
    const { email } = await createAdmin();
    const c = new Client(app.baseUrl);
    const res = await adminLogin(c, email);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.role, "admin");
    assert.equal((await c.get("/api/v1/admin/auth/me")).status, 200);
    assert.equal((await c.post("/api/v1/admin/auth/refresh")).status, 200);
  });

  it("rejects wrong codes and blocks the account on the third", async () => {
    const { email, id } = await createAdmin();
    const c = new Client(app.baseUrl);
    const { body } = await c.post("/api/v1/admin/auth/login", { email, password: PASSWORD });
    const real = /\b(\d{6})\b/.exec(app.mailer.last(email)?.text ?? "")?.[1] ?? "";
    const wrong = real === "000000" ? "111111" : "000000";
    const verify = (code: string) => c.post("/api/v1/admin/auth/login/verify", { challengeId: body.challengeId, code });
    assert.equal((await verify(wrong)).status, 401);
    assert.equal((await verify(wrong)).status, 401);
    const third = await verify(wrong);
    assert.equal(third.status, 403);
    assert.equal(third.body.error.code, "ACCOUNT_BLOCKED");
    const blocked = await User.findById(id).lean();
    assert.equal(blocked?.status, "active", "a temporary block, not a suspension");
    assert.equal(blocked?.blockedReason, "mfa");
    assert.equal((await verify(real)).status, 401, "even the right code is dead now");
    assert.equal((await new Client(app.baseUrl).post("/api/v1/admin/auth/login", { email, password: PASSWORD })).status, 403, "a blocked account cannot start over");

    // The block email links to the admin app's reset page; resetting there unblocks the admin.
    const link = /(http\S+reset-password\?token=\S+)/.exec(app.mailer.last(email)?.text ?? "")?.[1] ?? "";
    assert.ok(link.startsWith(`${ADMIN_ORIGIN}/reset-password`));
    const guest = new Client(app.baseUrl);
    assert.equal((await guest.post("/api/v1/admin/auth/reset-password", { token: app.mailer.tokenFor(email), password: "N3w&AdminPassw0rd" })).status, 204);
    assert.equal((await adminLogin(guest, email, "N3w&AdminPassw0rd")).status, 200);
  });

  it("resets a forgotten admin password by email, with the admin password rules", async () => {
    const { email } = await createAdmin();
    const c = new Client(app.baseUrl);
    assert.equal((await c.post("/api/v1/admin/auth/forgot-password", { email })).status, 202);
    const token = app.mailer.tokenFor(email);
    assert.equal((await c.post("/api/v1/auth/reset-password", { token, password: NEW_PASSWORD })).status, 400, "an admin link is not redeemable on the customer endpoint");
    assert.equal((await c.post("/api/v1/admin/auth/reset-password", { token, password: "Sh0rt&Pass" })).status, 400, "admins need 12+ characters");
    assert.equal((await c.post("/api/v1/admin/auth/reset-password", { token, password: "N3w&AdminPassw0rd" })).status, 204);
    assert.equal((await adminLogin(c, email, "N3w&AdminPassw0rd")).status, 200);
  });

  it("sends no admin reset link for a customer email", async () => {
    const { email } = await registerAndVerify();
    const before = app.mailer.sent.length;
    assert.equal((await new Client(app.baseUrl).post("/api/v1/admin/auth/forgot-password", { email })).status, 202);
    assert.equal(app.mailer.sent.length, before);
  });

  it("makes a code single use", async () => {
    const { email } = await createAdmin();
    const c = new Client(app.baseUrl);
    const { body } = await c.post("/api/v1/admin/auth/login", { email, password: PASSWORD });
    const code = /\b(\d{6})\b/.exec(app.mailer.last(email)?.text ?? "")?.[1];
    assert.equal((await c.post("/api/v1/admin/auth/login/verify", { challengeId: body.challengeId, code })).status, 200);
    assert.equal((await new Client(app.baseUrl).post("/api/v1/admin/auth/login/verify", { challengeId: body.challengeId, code })).status, 401);
  });

  it("does not email a code for a wrong password or unknown admin", async () => {
    const { email } = await createAdmin();
    const before = app.mailer.sent.length;
    const c = new Client(app.baseUrl);
    assert.equal((await c.post("/api/v1/admin/auth/login", { email, password: NEW_PASSWORD })).status, 401);
    assert.equal((await c.post("/api/v1/admin/auth/login", { email: "no@example.com", password: PASSWORD })).status, 401);
    assert.equal(app.mailer.sent.length, before);
  });

  it("refuses unknown challenges without creating Redis keys", async () => {
    const id = "A".repeat(43);
    assert.equal((await new Client(app.baseUrl).post("/api/v1/admin/auth/login/verify", { challengeId: id, code: "123456" })).status, 401);
    assert.equal(await infra.redis.exists(`adminlogin:${sha256(id)}`), 0);
  });

  it("will not accept a customer account on the admin login", async () => {
    const { email } = await registerAndVerify();
    assert.equal((await new Client(app.baseUrl).post("/api/v1/admin/auth/login", { email, password: PASSWORD })).status, 401);
  });

  it("cuts off a disabled admin on the very next request", async () => {
    const { email, id } = await createAdmin();
    const c = new Client(app.baseUrl);
    await adminLogin(c, email);
    await User.updateOne({ _id: id }, { $set: { status: USER_STATUSES.SUSPENDED } });
    assert.equal((await c.get("/api/v1/admin/auth/me")).status, 401);
  });

  it("changes the admin password and signs out other sessions", async () => {
    const { email } = await createAdmin();
    const a = new Client(app.baseUrl);
    const b = new Client(app.baseUrl);
    await adminLogin(a, email);
    await adminLogin(b, email);
    assert.equal((await a.post("/api/v1/admin/auth/change-password", { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status, 200);
    assert.equal((await b.get("/api/v1/admin/auth/me")).status, 401);
    assert.equal((await a.get("/api/v1/admin/auth/me")).status, 200);
  });

  it("records admin sign-ins in the audit trail", async () => {
    const { email } = await createAdmin();
    await adminLogin(new Client(app.baseUrl), email);
    await new Client(app.baseUrl).post("/api/v1/admin/auth/login", { email, password: NEW_PASSWORD });
    assert.ok(app.audit.events.some((item) => item.event === "login_success" && item.entry.scope === "admin"));
    assert.ok(app.audit.count("login_failure") >= 1);
  });
});

suite("two-step sign-in settings, code resends and idle timeout", () => {
  const codeFor = (email: string) => /\b(\d{6})\b/.exec(app.mailer.last(email)?.text ?? "")?.[1] ?? "";

  it("lets a customer turn the emailed code on and off with their password", async () => {
    const { client, email } = await registerAndVerify();
    await client.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    assert.equal((await client.get("/api/v1/auth/me")).body.user.mfaEnabled, false);

    assert.equal((await client.post("/api/v1/auth/mfa", { enabled: true, currentPassword: NEW_PASSWORD })).status, 401);
    const on = await client.post("/api/v1/auth/mfa", { enabled: true, currentPassword: PASSWORD });
    assert.equal(on.status, 200);
    assert.equal(on.body.user.mfaEnabled, true);
    assert.match(app.mailer.last(email)?.subject ?? "", /now on/);
    assert.ok(app.audit.count("mfa_enabled") >= 1);

    const next = await new Client(app.baseUrl).post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    assert.equal(next.status, 202, "the password alone no longer signs in");

    assert.equal((await client.post("/api/v1/auth/mfa", { enabled: false, currentPassword: PASSWORD })).status, 200);
    assert.match(app.mailer.last(email)?.subject ?? "", /turned off/);
    assert.equal((await new Client(app.baseUrl).post("/api/v1/auth/login", { identifier: email, password: PASSWORD })).status, 200);
  });

  it("needs a signed-in session to change the setting", async () => {
    assert.equal((await new Client(app.baseUrl).post("/api/v1/auth/mfa", { enabled: false, currentPassword: PASSWORD })).status, 401);
  });

  it("resends a sign-in code without the password, with a cooldown, and keeps the wrong-code count", async () => {
    const { email } = await createAdmin();
    const c = new Client(app.baseUrl);
    const { body } = await c.post("/api/v1/admin/auth/login", { email, password: PASSWORD });
    const oldCode = codeFor(email);
    const wrong = (code: string) => (code === "000000" ? "111111" : "000000");
    assert.equal((await c.post("/api/v1/admin/auth/login/verify", { challengeId: body.challengeId, code: wrong(oldCode) })).status, 401);

    assert.equal((await c.post("/api/v1/admin/auth/login/resend", { challengeId: body.challengeId })).status, 202);
    assert.equal((await c.post("/api/v1/admin/auth/login/resend", { challengeId: body.challengeId })).status, 429, "cooldown");
    const newCode = codeFor(email);
    assert.notEqual(newCode, "");

    // One wrong guess was already used, so two more block the account: resending never buys extra guesses.
    assert.equal((await c.post("/api/v1/admin/auth/login/verify", { challengeId: body.challengeId, code: wrong(newCode) })).status, 401);
    assert.equal((await c.post("/api/v1/admin/auth/login/verify", { challengeId: body.challengeId, code: wrong(newCode) })).status, 403);
  });

  it("accepts only the newest code after a resend", async () => {
    const { email } = await createAdmin();
    const c = new Client(app.baseUrl);
    const { body } = await c.post("/api/v1/admin/auth/login", { email, password: PASSWORD });
    const oldCode = codeFor(email);
    await c.post("/api/v1/admin/auth/login/resend", { challengeId: body.challengeId });
    const newCode = codeFor(email);
    if (oldCode !== newCode) assert.equal((await c.post("/api/v1/admin/auth/login/verify", { challengeId: body.challengeId, code: oldCode })).status, 401);
    assert.equal((await c.post("/api/v1/admin/auth/login/verify", { challengeId: body.challengeId, code: newCode })).status, 200);
  });

  it("refuses to resend for an unknown challenge", async () => {
    assert.equal((await new Client(app.baseUrl).post("/api/v1/auth/login/resend", { challengeId: "B".repeat(43) })).status, 401);
  });

  // Pretends the session was last used `idleMs` ago.
  const ageSession = (client: Client, cookie: string, idleMs: number) => {
    const sid = (jwt.decode(client.cookie(cookie) ?? "") as { sid: string }).sid;
    return infra.redis.hset(`ecommerce:session:${sid}`, "lastUsedAt", String(Date.now() - idleMs));
  };

  it("ends a customer session after 24 hours without activity", async () => {
    const { client, email } = await registerAndVerify();
    await client.post("/api/v1/auth/login", { identifier: email, password: PASSWORD });
    await ageSession(client, "sf_refresh", 23 * 3600_000);
    assert.equal((await client.post("/api/v1/auth/refresh")).status, 200, "23 hours idle is still fine");
    await ageSession(client, "sf_refresh", 24 * 3600_000 + 60_000);
    assert.equal((await client.post("/api/v1/auth/refresh")).status, 401);
    assert.equal((await client.get("/api/v1/auth/me")).status, 401, "the session itself is gone");
  });

  it("ends an admin session after 3 hours without activity", async () => {
    const { email } = await createAdmin();
    const c = new Client(app.baseUrl);
    await adminLogin(c, email);
    await ageSession(c, "adm_refresh", 2 * 3600_000);
    assert.equal((await c.post("/api/v1/admin/auth/refresh")).status, 200, "2 hours idle is still fine");
    await ageSession(c, "adm_refresh", 3 * 3600_000 + 60_000);
    assert.equal((await c.post("/api/v1/admin/auth/refresh")).status, 401);
  });
});

suite("admin IP allow-list", () => {
  it("blocks other addresses before the login is even reached", async () => {
    const guarded = await startApp(infra.redis, { adminAllowedIps: ["10.99.99.99"] });
    try {
      const outsider = new Client(guarded.baseUrl, "10.1.1.1");
      assert.equal((await outsider.post("/api/v1/admin/auth/login", { email: "a@example.com", password: PASSWORD })).status, 403);
      const insider = new Client(guarded.baseUrl, "10.99.99.99");
      assert.equal((await insider.post("/api/v1/admin/auth/login", { email: "a@example.com", password: PASSWORD })).status, 401);
      assert.equal(guarded.audit.count("admin_ip_blocked"), 1);
      assert.equal((await outsider.post("/api/v1/auth/forgot-password", { email: "a@example.com" })).status, 202, "customer routes are unaffected");
    } finally {
      await guarded.stop();
    }
  });
});
