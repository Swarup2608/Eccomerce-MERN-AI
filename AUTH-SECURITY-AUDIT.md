# Authentication & Security Audit — Storefront + Admin

**Date:** 2026-10-12
**Scope:** Backend auth (`backend/src`), storefront auth UI (`storefront/src`), admin auth UI (`admin/src`), CI (`.github/`).
**Method:** Read every auth-related file line by line, traced each flow from the browser to Redis/MongoDB, and ran the project's own checks.

| Check | Result |
|---|---|
| `npm run typecheck` (all 3 workspaces) | ✅ pass |
| `npm run lint` (all 3 workspaces) | ✅ pass |
| `npm test -w backend` | ✅ 81 / 81 pass (0 skipped) |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |

---

## 1. Verdict

| Area | Score | Notes |
|---|---|---|
| Token & session design | **9 / 10** | HttpOnly cookies, rotation with reuse detection, server-side revocation on every request |
| CSRF / XSS / headers | **9 / 10** | SameSite=Strict + Origin guard + nonce CSP + strict Helmet config |
| Injection & input validation | **9 / 10** | Zod `.strict()` everywhere, `sanitizeFilter`, `$`/`.`/`__proto__` key rejection |
| Account enumeration resistance | **8.5 / 10** | Neutral answers and dummy-hash timing on every public endpoint |
| Brute-force / abuse protection | **5.5 / 10** | Strong against guessing, but the lockout is itself a denial-of-service tool, and there is no bot protection |
| MFA | **6.5 / 10** | Works correctly, but email OTP is the only factor (admins included) |
| Password policy | **6.5 / 10** | Composition rules + tiny blocklist; no breached-password check; admin rule can be bypassed |
| Feature completeness | **6 / 10** | No device/session list, email change, account deletion, admin user management |
| Operability (audit, alerts, recovery) | **7.5 / 10** | Audit trail + break-glass scripts exist; scripts don't audit themselves; alerting depends on your log pipeline |
| Tests & CI | **8.5 / 10** | Real Redis/Mongo integration tests for nearly every flow; no frontend/E2E tests |

### Overall: **7.5 / 10 — production-ready after the 3 "fix before launch" items**

This is a well-engineered auth system, clearly above the typical MERN project. Most of the hard parts (refresh rotation, revocation, enumeration resistance, CSRF, cookie scoping, admin isolation) are done correctly and tested. What holds it back is not a hole that lets an attacker *in* — I did not find one — but issues that let an attacker **lock people out**, **abuse your outbound email**, or **weaken the admin account** below its own stated policy.

**Fix before launch (blocking):**
1. [H-1] Three wrong passwords lock any account (including the admin) for 24 h and sign them out everywhere: a trivial targeted DoS.
2. [M-1] Admin change-password accepts 8-character passwords, bypassing the 12-character admin policy.
3. [M-2] Attacker-controlled `firstName` (URLs, newlines) is emailed from your domain to any address: a phishing relay.

**Fix soon after launch:** M-3 to M-6. **Backlog:** the Low items and missing features.

---

## 2. How it is built

### 2.1 Architecture

```
 Browser (storefront)            Browser (admin)
   shop.example.com                admin.example.com
        │  fetch(credentials:"include")   │
        └──────────────┬──────────────────┘
                       ▼
             api.example.com  (Express 5)
   requestContext → helmet → no-store → CORS → originGuard
   → global rate limit → JSON (100kb) → cookieParser → rejectUnsafeKeys
                       │
     /api/v1/auth/*  (customers)      /api/v1/admin/*  (adminIpGuard)
                       │                 /api/v1/admin/auth/*
                       ▼
                 AuthService
         ┌─────────────┼──────────────┐
         ▼             ▼              ▼
   MongoDB (users,   Redis (sessions,   SMTP (codes,
   audit events)     counters, OTPs)    links, alerts)
```

- **Two isolated scopes**, `user` and `admin` ([auth.policy.ts](backend/src/modules/auth/auth.policy.ts)): separate JWT secrets (enforced different at boot), separate audiences, separate cookie names and paths, separate role allow-lists. A customer token can never pass as an admin token, which is tested.
- **The Next.js apps never see the tokens.** Cookies are host-only on the API domain. Both frontends gate their UI client-side; the API re-checks everything ([admin-gate.tsx:9-14](admin/src/components/admin-gate.tsx#L9-L14) documents this correctly).

### 2.2 Tokens and sessions

| Item | User (storefront) | Admin |
|---|---|---|
| Access JWT (HS256, `iss`, `aud`, `sub`, `sid`, `type`) | 15 min | 10 min |
| Refresh JWT (`jti`, single use) | rotates | rotates |
| Idle timeout (no refresh) | 24 h | 3 h |
| Absolute session lifetime (Redis TTL, never extended) | 30 days | 12 h |
| Cookie | `__Secure-sf_*`, HttpOnly, Secure, SameSite=Strict | `__Secure-adm_*`, same flags |
| Access cookie path / refresh cookie path | `/api/v1` / `/api/v1/auth` | `/api/v1/admin` / `/api/v1/admin/auth` |

- **Session store** ([session-store.ts](backend/src/utils/session-store.ts)): Redis hash per session holding the current refresh `jti`; a per-user set indexes sessions for "sign out everywhere".
- **Rotation** is one atomic Lua compare-and-swap. Replaying the previous token within 30 s (second tab, lost response) returns the same replacement; replaying it later **destroys the session** and records `refresh_reuse`.
- **Every authenticated request** verifies the JWT, then checks the Redis session exists and matches scope/user, then checks in MongoDB that the user is `active` and not blocked ([auth.service.ts:365-381](backend/src/modules/auth/auth.service.ts#L365-L381)). Logout, suspension and blocks take effect immediately, not at token expiry.
- **Session fixation:** any refresh cookie the browser already holds is revoked on login.
- **Frontend refresh** is single-flight per tab ([storefront/src/lib/auth.ts:29-39](storefront/src/lib/auth.ts#L29-L39)) so parallel 401s don't trigger reuse detection.

### 2.3 Flows

**Customer registration** → `POST /auth/register`
argon2id hash is computed *before* the existence check (equal timing) → neutral `202` whether the email is new or taken → verification link (24 h, single-use, only the SHA-256 stored in Redis). A taken username or phone gets the same neutral answer; only the mailbox owner is told why. Unverified accounts are deleted by a partial TTL index after 7 days.

**Customer login** → `POST /auth/login` (email or username)
argon2 verify always runs (dummy hash for unknown users) → the account must be verified → if `mfaEnabled`, a 6-digit code is emailed and a `challengeId` returned; otherwise the session starts.

**Admin login** → `POST /admin/auth/login` → `POST /admin/auth/login/verify`
The password step always ends in an emailed code (5 min TTL, 3 tries, single use, constant-time compare). There is no admin registration: the admin is created by `seed:admin`. An optional `ADMIN_ALLOWED_IPS` allow-list guards all of `/api/v1/admin/*`.

**Forgot / reset password** (both scopes)
Neutral `202`. The reset link lasts 1 h and is single-use (`GETDEL`), and issuing a new one invalidates the old one. User and admin links have separate kinds, so neither can be redeemed on the other endpoint. A reset re-hashes the password, verifies the email, lifts any block, clears every counter and revokes all sessions.

**Change password** needs the current password (3 wrong attempts block the account), revokes all sessions, then gives this browser a fresh one.

**Customer MFA toggle** needs the current password and emails the owner either way.

**Lockout model.** 3 wrong passwords per identifier in 15 min, or 3 wrong codes per challenge, or more than 3 verification resends in 24 h, block the account for 24 h, revoke every session and email a reset link. Unknown identifiers are "blocked" too, so the block response doesn't reveal whether an account exists.

### 2.4 Defence-in-depth already in place

- **CSRF:** SameSite=Strict cookies, an Origin allow-list on unsafe methods ([security.ts:37-44](backend/src/middleware/security.ts#L37-L44)), and `application/json`-only bodies.
- **XSS:** per-request nonce CSP with `strict-dynamic` on both Next apps ([proxy.ts](storefront/src/proxy.ts)), tokens unreachable from JS, and the API's own CSP is `default-src 'none'`.
- **NoSQL injection:** `sanitizeFilter` + `strictQuery`, `$`/dotted/`__proto__` keys rejected, `query parser: simple`, Zod `.strict()` schemas.
- **Headers:** HSTS preload, frame-ancestors none, CORP/COOP, `no-referrer` (admin), `X-Robots-Tag` noindex on admin, `Cache-Control: no-store` on every API response.
- **Rate limiting:** Redis fixed window, global 120/min per IP, auth 50/15 min per IP that **fails closed**, IPv6 grouped by /64, explicit `TRUST_PROXY` required in production.
- **Config:** Zod-validated env, https enforced for production origins, distinct ≥32-char secrets, SMTP required in production, same-site deployment warning.
- **Logging:** structured JSON with key-based redaction (`password|secret|token|cookie|session|uri`), and the Redis error handler logs only the message so the URL can't leak.
- **Audit:** 18 event types in MongoDB (365-day TTL); security events are also logged at `warn` with `security:true` for alerting.
- **Server hardening:** slowloris timeouts, graceful shutdown, `x-powered-by` off, no source maps.
- **Open redirect:** post-login destinations are fixed (`/account`, `/`), never taken from the query string.

---

## 3. Findings

Severity reflects production impact. Every finding was traced in the code; none are speculative unless marked *conditional*.

### HIGH

#### H-1 — Anyone can lock out any account, including the admin, with 3 requests
**Where:** [auth.service.ts:70,74](backend/src/modules/auth/auth.service.ts#L70) (`MAX_WRONG_ATTEMPTS = 3`, `BLOCK_TTL_SEC = 24h`), [auth.service.ts:303-311](backend/src/modules/auth/auth.service.ts#L303-L311)

The failure counter is per *identifier* across all clients. Three wrong passwords for `victim@example.com` from anywhere, within 15 minutes:
- block the account for 24 h,
- **revoke every live session** (the victim is kicked out mid-checkout),
- send them an alarming email.

For the admin, the attacker only needs the admin email. If `ADMIN_ALLOWED_IPS` is unset (the default), three `POST /api/v1/admin/auth/login` calls take the store's only admin offline. The reset link unblocks them, but the attacker can re-lock immediately, indefinitely. Customer emails are widely available from breach lists, so mass lockout is cheap (3 requests per victim, well under the 50 per 15 min per-IP budget, and trivially distributed).

**Fix:**
- Do **not** revoke existing sessions on a *password-guess* block. Someone who already holds a valid session isn't the attacker. Keep revocation for MFA-code failures (which prove the password is known) and change-password failures.
- Replace the hard block with progressive throttling: raise the threshold to 5–10, add exponential delay per identifier, and require a CAPTCHA (see M-3) after N failures instead of blocking.
- Key the hard block on `(identifier, IP or /64)` and keep a much higher identifier-wide threshold.
- Make `ADMIN_ALLOWED_IPS` (or VPN / Cloudflare Access / mTLS in front of `/api/v1/admin`) **mandatory in production**, enforced in [env.ts](backend/src/config/env.ts) the way `TRUST_PROXY` already is.

### MEDIUM

#### M-1 — Admin change-password bypasses the 12-character admin policy
**Where:** [auth.controller.ts:93-96](backend/src/modules/auth/auth.controller.ts#L93-L96) uses `changePasswordSchema` for **both** scopes, and that schema is built on the 8-character `passwordSchema` ([user.validation.ts:82](backend/src/modules/users/user.validation.ts#L82)). Seed, reset-script and admin email-reset all use `adminPasswordSchema` (12+). The admin UI form also hints "8+ characters" ([admin change-password-form.tsx:36](admin/src/components/change-password-form.tsx#L36)).

**Effect:** a signed-in admin can set an 8-character password, weakening the most privileged account.

**Fix:** add `adminChangePasswordSchema = z.object({ currentPassword, newPassword: adminPasswordSchema }).strict()`, choose it by scope like `resetPassword` does, update the admin form hint to 12+, and add a test.

#### M-2 — Email content injection: your domain sends attacker-written text to any address
**Where:** [user.validation.ts:55-56](backend/src/modules/users/user.validation.ts#L55-L56) (`firstName`/`lastName` accept any characters, including newlines and URLs); used verbatim in [auth.emails.ts](backend/src/modules/auth/auth.emails.ts); [mailer.ts:20-23](backend/src/lib/mailer.ts#L20-L23) turns any `https?://…` in the text into a clickable `<a>`.

**Exploit:** `POST /auth/register` with `email=victim@corp.com` and `firstName="Your order failed, pay here https://evil.example/x\n\n"`. The victim receives a genuine, SPF/DKIM-valid email from your store containing a clickable phishing link. The `detailsUnavailableEmail` path does the same. Per-IP limits slow this down but don't stop a distributed sender, and it puts your sending-domain reputation at risk.

**Fix:**
- Restrict names to letters, marks, spaces, `'` and `-` (for example `^[\p{L}\p{M}][\p{L}\p{M} '\-]{0,49}$/u`), so no `/`, `:`, `.`, `@`, digits or newlines.
- Don't greet with user-supplied names in emails sent **before** the address is verified ("Hi there," instead).
- In `toHtml`, only linkify URLs that start with `STOREFRONT_URL` or `ADMIN_URL`.

#### M-3 — No bot protection on public endpoints
**Where:** `/register`, `/login`, `/forgot-password`, `/resend-verification`, admin `/login`.

Only per-IP rate limits protect them. Combined with H-1 and M-2, a residential-proxy botnet can lock accounts, email-bomb arbitrary inboxes through your SMTP, and burn CPU/RAM: each request runs argon2id with default ~64 MiB memory, so 50 concurrent registrations need ~3 GiB.

**Fix:** add Cloudflare Turnstile, hCaptcha or reCAPTCHA (verified server-side) on register and forgot-password always, and on login after the first failure. Add a global concurrency cap (a semaphore) around `hashPassword`/`verifyPassword`.

#### M-4 — MFA is email-only, including for the admin
**Where:** [auth.service.ts:229-240](backend/src/modules/auth/auth.service.ts#L229-L240)

Whoever controls the admin mailbox (where the password reset also goes) controls the store: the reset link plus the login code both land in one inbox, so the second factor collapses into a single one. Email OTPs are also phishable in real time.

**Fix:** add TOTP (authenticator app) and ideally WebAuthn/passkeys for admin, require it, and keep email OTP as fallback only. An admin password reset should still require the TOTP/WebAuthn factor, or recovery codes.

#### M-5 — Forgot-password / resend limits are per (email + IP), so a victim's inbox can be flooded and their link invalidated
**Where:** [auth.service.ts:401-402](backend/src/modules/auth/auth.service.ts#L401-L402), [auth.service.ts:187](backend/src/modules/auth/auth.service.ts#L187)

Rotating IPs bypasses the 5/hour cap. Every request also **invalidates the previous link** ([one-time-token.ts:12-19](backend/src/utils/one-time-token.ts#L12-L19)), so an attacker can keep breaking a real user's reset (the owner's only way out of an H-1 block).

**Fix:** add a per-*email* cap regardless of IP (for example 3 per hour and 10 per day), plus a cooldown (60 s) that doesn't issue a new token while one sent in the last minute is still valid.

#### M-6 — *Conditional:* the Lua scripts and multi-key ops are not Redis-Cluster safe
**Where:** [session-store.ts:40](backend/src/utils/session-store.ts#L40) says "safe on Redis Cluster", but `ecommerce:session:<id>` and `ecommerce:session:grace:<id>` hash to different slots. The `DEL` with many keys in `revokeAllUserSessions` and the one-time-token `MULTI` have the same problem.

**Effect:** if you ever move to a clustered Redis (Redis Cloud "OSS Cluster API", ElastiCache cluster mode), every refresh fails with `CROSSSLOT` and **everyone is logged out**. It's fine on a single-shard Redis, which is what you have today.

**Fix:** use hash tags (`ecommerce:session:{<sid>}` / `ecommerce:session:{<sid>}:grace`, `ott:{<userId>}:…`) and delete per key in a pipeline. Or document "single-shard Redis only" and fix the comment.

### LOW

| ID | Finding | Where | Fix |
|---|---|---|---|
| L-1 | `hset` and `expire` for the MFA challenge are separate calls; a crash between them leaves a challenge with no TTL | [auth.service.ts:236-237](backend/src/modules/auth/auth.service.ts#L236-L237) | Wrap in `multi()` as `resendLoginCode` already does |
| L-2 | Verify/reset tokens stay in the address bar and browser history after use | [verify-email.tsx](storefront/src/app/verify-email/verify-email.tsx), both `reset-password-form.tsx` | `history.replaceState(null, "", location.pathname)` once the token is read |
| L-3 | Phone numbers are unique but unverified, so anyone can squat someone else's number and block their registration | [user.model.ts:52](backend/src/modules/users/user.model.ts#L52) | Make the index unique only for `phoneVerified: true`, or verify by SMS before saving |
| L-4 | An unverified account's email can be "held" for 7 days by an attacker (pre-registration). The owner can recover via forgot-password, but the attacker's username and phone stay on the account | registration flow | When a reset verifies a never-verified account, also clear or reset `userName`/`phoneNumber`, or force a profile review |
| L-5 | **Latent:** the TTL index deletes any document with `emailVerified:false` older than 7 days. A future "change email → set `emailVerified=false`" would **delete established accounts** | [user.model.ts:56](backend/src/modules/users/user.model.ts#L56) | Key the TTL on a dedicated `pendingVerificationSince` field instead of `createdAt` + `emailVerified` |
| L-6 | Break-glass scripts (`reset-admin`, `unblock-user`) write no audit event, and `unblock-user` silently reactivates *suspended* accounts | [scripts/](backend/src/scripts/) | Record `admin_password_reset_cli` / `account_unblocked` with an operator name; add a flag before un-suspending |
| L-7 | The dev mailer logs full email bodies, including live tokens, when `SMTP_HOST` is unset. That is only blocked when `NODE_ENV=production`, so a staging box on `development` leaks reset links to logs | [mailer.ts:29-35](backend/src/lib/mailer.ts#L29-L35) | Require SMTP whenever `NODE_ENV !== "development"`, or redact the URLs |
| L-8 | No JWT key rotation (no `kid`); rotating a secret logs everyone out | [tokens.ts](backend/src/utils/tokens.ts) | Support `ACCESS_TOKEN_SECRETS=current,previous` and sign with `kid` |
| L-9 | Password policy is composition rules plus a 31-entry blocklist. NIST 800-63B recommends length plus breached-password screening, not composition | [user.validation.ts:25-40](backend/src/modules/users/user.validation.ts#L25-L40) | Add an HIBP k-anonymity range check; consider 10+ minimum for customers and 14+ for admin |
| L-10 | MFA codes are stored as unsalted SHA-256 of 6 digits, which Redis read access reverses instantly | [auth.service.ts:236](backend/src/modules/auth/auth.service.ts#L236) | HMAC with a server secret (cheap change) |
| L-11 | `/health/ready` is public and names the dependencies; a client-supplied `X-Request-Id` is trusted in logs | [health.ts](backend/src/routes/health.ts), [request-context.ts:19-20](backend/src/middleware/request-context.ts#L19-L20) | Restrict `/ready` to the internal network; prefix or ignore upstream ids unless they come from your proxy |
| L-12 | Every authenticated request does one Redis call plus one MongoDB `exists`, which will matter at scale | [auth.service.ts:375-379](backend/src/modules/auth/auth.service.ts#L375-L379) | Cache "user active" in the Redis session hash and invalidate it on status/block change |
| L-13 | `resend-verification` can be used to block an *unverified* stranger's account (4 requests about 1 min apart) | [auth.service.ts:195-196](backend/src/modules/auth/auth.service.ts#L195-L196) | Stop sending instead of blocking; blocking adds nothing for an account that can't sign in anyway |
| L-14 | Audit records keep IP + user agent for 365 days, which is personal data under GDPR/DPDP | [audit.model.ts:22](backend/src/modules/audit/audit.model.ts#L22) | Document it in the privacy policy; consider truncating IPs after 90 days |

---

## 4. What is missing (features)

### Storefront (customers)
| Missing | Priority | Why it matters |
|---|---|---|
| Active sessions / devices list with per-device sign-out | High | You already store UA + IP per session; users can't see or revoke one device |
| New-device / new-location sign-in email | Medium | The main way users notice a takeover |
| Change email (re-verify the new address, notify the old one) | Medium | Watch L-5 when building it |
| Account deletion & data export | Medium (legal) | GDPR / India DPDP right to erasure |
| TOTP / passkeys for customers | Medium | Email OTP is the only option |
| Phone verification (SMS OTP) | Low | `phoneVerified` exists but nothing sets it |
| Social login (Google/Apple) | Low | Conversion, not security |
| "Remember me" choice | Low | Currently always a 30-day session |
| Frontend / E2E tests (Playwright) | Medium | Only backend is tested |

### Admin
| Missing | Priority | Why it matters |
|---|---|---|
| TOTP / WebAuthn MFA, required | **High** | See M-4 |
| More than one admin, plus roles (RBAC: owner / staff / support) | High | A single admin is a single point of failure and has no least privilege |
| Admin UI for user management (search, suspend, unblock, force reset) | High | `setUserStatus` exists but nothing calls it; support depends on CLI scripts |
| Audit-log viewer | Medium | Events are written but there's nowhere to read them |
| Mandatory network restriction in production | High | See H-1 |
| Admin session list / revoke | Medium | Same as storefront |
| Re-authentication (step-up) for dangerous admin actions | Medium | Needed once admin can refund or delete things |

### Platform / ops
| Missing | Priority |
|---|---|
| Alerting wired to `security:true` log events (lockout spikes, `refresh_reuse`, `admin_ip_blocked`) | High |
| CAPTCHA / bot management (M-3) | High |
| Secret rotation runbook + `kid` support (L-8) | Medium |
| SPF/DKIM/DMARC for `EMAIL_FROM` domain, and a transactional provider (SES/Postmark) with bounce handling | High (deliverability = admins can't log in without it) |
| Load test of argon2 under concurrency; tune `memoryCost`/`parallelism` for the instance size | Medium |
| Pen test / DAST (OWASP ZAP) in CI | Medium |
| Documented incident runbook (admin locked out, mailbox lost, secret leaked) | Medium |

---

## 5. Production launch checklist

**Configuration**
- [ ] `NODE_ENV=production`, https origins, `TRUST_PROXY` matching the real proxy hop count
- [ ] Storefront, admin and API on the **same registrable domain** (`shop.` / `admin.` / `api.example.com`), otherwise SameSite=Strict breaks sign-in
- [ ] `API_PUBLIC_URL` set so the same-site check runs at boot
- [ ] `ADMIN_ALLOWED_IPS` set, or admin behind VPN / Zero-Trust
- [ ] Unique random 48-byte `ACCESS_TOKEN_SECRET` and `ADMIN_ACCESS_TOKEN_SECRET` in a secret manager
- [ ] `rediss://` (TLS) Redis, single shard (or fix M-6); MongoDB Atlas IP allow-list + least-privilege DB user
- [ ] SMTP with SPF/DKIM/DMARC passing; test that the admin code email actually arrives
- [ ] `SEED_ADMIN_*` removed from env after seeding

**Code fixes**
- [ ] H-1 lockout redesign
- [ ] M-1 admin change-password schema
- [ ] M-2 name validation + safe linkify
- [ ] M-3 CAPTCHA
- [ ] L-1 atomic challenge creation

**Monitoring**
- [ ] Log shipping + alert rules on `security:true`
- [ ] Uptime check on `/health/ready` (from inside the network)

---

## 6. What's already strong (keep it)

- Tokens never touch JavaScript or `localStorage`.
- Refresh-token rotation with atomic CAS, a grace window and reuse detection. Most production apps get this wrong; it's right here and tested.
- Server-side session check on **every** request, so revocation is instant.
- Strict separation of customer and admin (secrets, audiences, cookies, paths, roles, one-time-token kinds).
- Consistent anti-enumeration: neutral responses, dummy argon2 hash, identical block messages for real and fake accounts.
- Fail-closed auth rate limiting; IPv6 /64 grouping.
- Nonce-based CSP on both frontends; locked-down API headers.
- Zod-validated config that refuses to boot an insecure production setup.
- 81 passing tests against real Redis and MongoDB, covering lockouts, rotation, replay, idle timeouts, suspension and scope isolation.
