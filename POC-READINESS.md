# POC Readiness Report: E-commerce Monorepo (Express + Next.js + MongoDB + Redis)

**Date:** 2026-10-19
**Branch reviewed:** `feat/commerce` (HEAD `5da157a`)
**Question:** Is this project ready to put on a resume as a POC / portfolio project?

---

## 1. Short answer

**Yes. As a POC it is resume-ready, and it is stronger than most MERN portfolio projects.**
Before you share the link, though, fix four presentation gaps. None of them is about the code quality:

| # | Gap | Why it matters to a recruiter | Effort |
|---|---|---|---|
| 1 | **No README** | The repo is the first thing a reviewer opens. Without a README they won't know what it does or how to run it | 1–2 h |
| 2 | **"AI" is in the repo name, but the project has no AI features** | Interviewers will ask about it. Either rename the repo or add one real AI feature (see §8) | 5 min rename / 1–2 days feature |
| 3 | **No live demo** | No Dockerfile or deploy config. A live URL and test credentials make a portfolio project far more convincing | ½–1 day |
| 4 | **Work is not on `master`** | The full commerce work is on `feat/commerce`. Reviewers usually look only at the default branch | 5 min |

Once those four are done, it is a **strong, honest, interview-defensible POC**.

---

## 2. What I verified myself

I ran every quality gate the project defines, on this machine, today:

| Check | Command | Result |
|---|---|---|
| Lint (3 workspaces) | `npm run lint` | ✅ clean |
| Type check (3 workspaces) | `npm run typecheck` | ✅ clean |
| Backend tests | `npm test` | ✅ **127 / 127 passing**, 36 suites, ~17 s |
| Production build | `npm run build` | ✅ backend + storefront + admin all build |
| Dependency audit | `npm audit --omit=dev` | ✅ **0 vulnerabilities** |
| CI | `.github/workflows/ci.yml` | ⚠️ → ✅ lint → typecheck → test (real Mongo 7 + Redis 7 service containers) → audit. Typecheck **failed on clean CI runners** (missing generated Next.js `PageProps`/`LayoutProps` types). Fixed by changing the frontend `typecheck` scripts to `next typegen && tsc --noEmit`, and checked with the generated files removed |
| Dependabot | `.github/dependabot.yml` | ✅ present |

**Size:** about 18,500 lines of TypeScript (backend ~9,500 · storefront ~5,300 · admin ~3,750), 83 API route handlers, 17 storefront pages, 16 admin pages.

---

## 3. What the project is

A full-stack e-commerce platform built as an npm-workspaces monorepo with three apps:

```
 storefront (Next.js 16, :3000)          admin console (Next.js 16, :3001)
   shoppers: browse, cart, checkout        staff: catalog, orders, customers, sales
              │      fetch(credentials: "include")      │
              └──────────────────┬──────────────────────┘
                                 ▼
                     REST API (Express 5, :4000)  /api/v1/*
                                 │
     ┌──────────────┬────────────┼──────────────┬──────────────────┐
     ▼              ▼            ▼              ▼                  ▼
  MongoDB         Redis      Cloudflare R2   Razorpay / Stripe    SMTP
  (Mongoose 9)   sessions,   product images  payments, refunds,   transactional
  catalog,       rate limits, (presigned     signed webhooks      email
  orders, audit  OTPs, locks  uploads)
```

### Tech stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict) everywhere |
| Backend | Node.js 22, Express 5, Mongoose 9, ioredis, Zod 4, argon2, jsonwebtoken, Helmet, Nodemailer |
| Frontend | Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4 |
| Data | MongoDB, Redis |
| Payments | Razorpay, Stripe, Cash on Delivery |
| Storage | Cloudflare R2 (S3 API, AWS SDK v3) |
| Testing | Node built-in test runner + tsx, integration tests against real MongoDB and Redis |
| DevOps | GitHub Actions CI, Dependabot, ESLint 9, Prettier |

---

## 4. Features (all present in the code)

### Storefront (customers)
- Home, product listing with category filters and sorting, product detail page with gallery
- Sales / offers page
- Guest cart in localStorage, server cart after sign-in
- Wishlist, address book
- Checkout with **Razorpay, Stripe or Cash on Delivery**
- Order history, order detail and tracking, customer cancellation
- Register, verify email, log in (email or username), forgot / reset password, change password, optional email-OTP MFA

### Admin console (staff)
- Dashboard: orders today, 30-day revenue, daily revenue chart
- Category management with **category-specific product attributes**
- Product create/edit with **direct-to-R2 image uploads**
- Order management: status workflow, tracking links, refunds
- Customer list and detail
- **Sales engine**: percent or fixed discounts, scoped to the whole catalog, chosen categories or chosen products, with scheduling (live / scheduled / ended / disabled)
- Admin login always requires an emailed one-time code; optional IP allow-list

### Operational scripts
`seed:admin`, `reset:admin`, `unblock:user`, `seed:catalog`, `cleanup:uploads` (removes orphaned images), `r2:cors`.

---

## 5. Engineering highlights (your strongest interview material)

These are the parts that set this project apart from a tutorial clone. I checked each one in the code.

### Security and authentication
- **Tokens in HttpOnly cookies only.** JavaScript never sees a token, so XSS can't steal one.
- **Refresh-token rotation with reuse detection,** done as **one atomic Redis Lua script** (`backend/src/utils/session-store.ts`). Replaying an old refresh token destroys the session.
- **Server-side revocation on every request.** Logout, blocking and suspension take effect immediately, not when the token expires.
- **Separate customer and admin scopes**: separate JWT secrets, audiences, cookie names and cookie paths.
- **argon2id** password hashing.
- **Resistance to account enumeration**: register, login and reset give neutral responses and take equal time.
- **CSRF defense in depth**: SameSite=Strict cookies, an Origin allow-list on state-changing requests, and JSON-only bodies.
- **Nonce-based CSP with `strict-dynamic`** on both Next.js apps (`storefront/src/proxy.ts`). The API's own CSP is `default-src 'none'`.
- **NoSQL-injection hardening**: Zod `.strict()` schemas, Mongoose `sanitizeFilter`, and rejection of `$`, dotted and `__proto__` keys.
- **Redis-backed rate limiting** (global limit plus a stricter auth limit).
- **Environment config validated with Zod at boot**, with production guards (HTTPS origins, distinct secrets of 32+ characters).
- **Audit trail** of security and commerce events stored in MongoDB.

### Commerce correctness
- **Prices always come from the database, never from the client.** The cart is re-priced on every read.
- **Money is stored as integer paise.** No floating-point currency.
- **Atomic stock reservation**: a conditional `$inc` per line, all-or-nothing, with a guard so stock is released at most once.
- **Idempotent checkout**: a client UUID plus a unique index (`user + idempotencyKey`), so a retried or double-clicked checkout returns the same order.
- **Payment verification**: Razorpay HMAC checked with `timingSafeEqual` plus a server-side capture check. Stripe webhooks are checked with `constructEvent`. Raw-body signatures are verified and each event is processed only once.
- **Late payments on cancelled orders are refunded automatically.**
- **Explicit order state machine** (pending_payment → confirmed → processing → shipped → delivered / cancelled / returned).
- **Expiry sweep for unpaid orders** uses a Redis lock, so only one instance runs it when the API is scaled horizontally.
- **Graceful shutdown** and slowloris-style server timeouts.

### Image uploads
- **Presigned PUT URLs**: the signature covers the content type and length, so the browser uploads straight to R2 and the API never handles the file bytes.
- A cleanup job deletes uploads that were never attached to a product.

### Testing
- **127 integration and unit tests** that run against **real MongoDB and Redis**, not mocks. The test harness starts its own `mongod` and `redis-server`. Payment gateways are replaced with fakes.
- They cover auth flows, catalog, cart and shopper flows, orders, payments, sales, tokens and app-level security.

---

## 6. Resume content (ready to paste)

### Project title options
- **Full-Stack E-Commerce Platform**: TypeScript, Next.js, Express, MongoDB, Redis
- **Secure Multi-App Commerce Platform** (Storefront + Admin + REST API)

### One-line summary
> Built a production-style e-commerce platform as a TypeScript monorepo: a Next.js 16 storefront and admin console on an Express 5 REST API, with MongoDB, Redis, Razorpay/Stripe payments and Cloudflare R2 image storage.

### Bullet points (pick 4–6)
- Architected a **TypeScript monorepo** with 3 apps (Next.js 16 storefront, Next.js admin console, Express 5 REST API) exposing **80+ endpoints**, backed by MongoDB and Redis.
- Implemented **cookie-based JWT auth with refresh-token rotation and reuse detection** using an **atomic Redis Lua script**, with immediate server-side session revocation, email verification, password reset and **email-OTP MFA**.
- Integrated **Razorpay, Stripe and Cash on Delivery** with **HMAC- and signature-verified webhooks**, event deduplication, refunds and automatic refunds for late payments.
- Designed a **race-safe checkout**: server-side pricing in integer paise, **atomic stock reservation**, and **idempotency keys** that stop duplicate orders on retries.
- Hardened the platform against OWASP Top 10 risks with a **nonce-based CSP**, CSRF origin guards, NoSQL-injection sanitization, **argon2id** hashing, Redis rate limiting and enumeration-safe auth responses.
- Built **direct-to-storage image uploads** to Cloudflare R2 with presigned URLs that bind content type and size, plus orphan cleanup.
- Built an **admin console** with a revenue dashboard, an order workflow, customer management and a **scheduled sales/discount engine** (percent or fixed, by catalog, category or product).
- Wrote **127 integration tests against real MongoDB and Redis** and set up **GitHub Actions CI** (lint, typecheck, tests, dependency audit) with **0 known production vulnerabilities**.

### Skills line
`TypeScript · Node.js · Express · Next.js · React · MongoDB · Mongoose · Redis · REST APIs · JWT · OAuth-style session design · Stripe · Razorpay · AWS S3 / Cloudflare R2 · Zod · Tailwind CSS · GitHub Actions · Integration Testing`

> Note: technically this is not "MERN" in the classic sense (Next.js instead of plain React SPA). Calling it "MERN" is fine; listing "Next.js" explicitly is better because it is more in demand.

---

## 7. What NOT to claim (honesty guardrails)

Interviewers probe resume claims. Stay accurate on these:

| Don't say | Why | Say instead |
|---|---|---|
| "AI-powered" | There are no AI/LLM/ML features in the code | Leave AI out unless you add a feature (§8) |
| "Production / live / serving users" | Not deployed, no real traffic | "Production-grade POC" or "production-style" |
| "Multi-vendor marketplace" | Older commits had vendor work; the current code is single-store | "E-commerce platform" |
| "End-to-end tested" | Tests are backend only; no frontend or E2E tests | "127 backend integration tests" |
| "Scalable to N users" | No load testing was done | Talk about the design choices (stateless API, Redis sessions, sweep lock) |
| "Fully secure / audited" | Gaps remain (see §9) | "Security-hardened" and be ready to discuss trade-offs |

---

## 8. Checklist before it goes on the resume

### Must do (presentation)
- [ ] **Write a `README.md`** covering: one-paragraph pitch, screenshots or GIF of storefront and admin, architecture diagram (copy §3), tech stack, feature list, "Run locally" steps (`.env.example` files already exist), test command, and a "Design decisions" section (copy §5).
- [ ] **Decide on the name**: rename `Eccomerce-MERN-AI` to something like `commerce-platform` (this also fixes the "Eccomerce" typo), **or** add a real AI feature.
- [ ] **Merge `feat/commerce` into `master`** so the default branch shows the finished work.
- [ ] **Remove design scratch files from the repo root** (`Vektor Store v2.dc.html`, `Vektor Store v3.dc.html`, `ProductCardV2.dc.html`, about 340 KB) or move them to a `design/` folder.
- [ ] **Don't commit secrets.** `.env` files are already git-ignored. Keep it that way, and if the repo goes public, make sure no real key appears in the git history.

### Strongly recommended
- [ ] **Deploy a live demo.** Example setup: API on Render, Railway or Fly.io; storefront and admin on Vercel; MongoDB Atlas free tier; Upstash or Redis Cloud free tier; Razorpay/Stripe **test mode**.
  - ⚠️ Auth cookies are `SameSite=Strict`. All three apps need to share one registrable domain (e.g. `shop.yourdomain.com`, `admin.yourdomain.com`, `api.yourdomain.com`). `*.vercel.app` + `*.onrender.com` **will not work** for login. The backend already warns about this at startup.
  - Admin login emails a one-time code, so the demo needs working SMTP (Resend, Brevo, or the Mailtrap/Gmail free tiers).
- [ ] **Add test-mode payment details** to the README (e.g. Stripe card `4242 4242 4242 4242`) and a read-only demo customer.
- [ ] **Add a `Dockerfile` and `docker-compose.yml`** (api + mongo + redis) so a reviewer can run everything with one command.
- [ ] **Record a 2–3 minute walkthrough video** (browse → cart → pay → admin ships order → customer sees tracking).

### Nice to have (makes it stand out more)
- [ ] One **Playwright E2E test** of the checkout happy path, added to CI.
- [ ] `sitemap.ts` and JSON-LD `Product` data for SEO.
- [ ] Optimized product images (`next/image` or Cloudflare image resizing). Right now original-size images are served.

### Optional: earn the "AI" in the name
Any one of these, done properly, makes "AI" honest:
- **Semantic product search** (embeddings in MongoDB Atlas Vector Search)
- **AI product-description generator** in the admin editor (generate from title + attributes)
- **Shopping assistant chat** that answers from your catalog (RAG over products)
- **"Customers also viewed" recommendations** from order and wishlist data

---

## 9. Known limitations (be ready to discuss in interviews)

Being upfront about these is a good signal in an interview. I found each one in the current code.

| Area | Limitation | How you'd fix it (talking point) |
|---|---|---|
| Account lockout | 3 wrong passwords block an account for 24 h (`MAX_WRONG_ATTEMPTS = 3` in `auth.service.ts`). An attacker who knows an email can lock that account out | Progressive delays, CAPTCHA (Cloudflare Turnstile), lock per identifier + IP |
| Admin password policy | Change-password uses the general 8-character password schema for both scopes, while other admin flows require 12+ | Use the admin schema for the admin route |
| Bot protection | No CAPTCHA anywhere | Turnstile on register, login and checkout |
| MFA | Email OTP only | TOTP / passkeys (WebAuthn) for admins |
| Stock hoarding | No cap on open orders per user. COD orders hold stock until an admin acts | Per-user open-order caps, checkout rate limit, COD confirmation |
| COD limit | `COD_MAX_TOTAL` is ₹50,000 | Make it configurable and lower |
| Payment edge case | A payment whose amount doesn't match is logged and audited but not refunded automatically | Auto-refund mismatches like late payments |
| Roles | One admin role; no staff roles or permissions | RBAC (owner / manager / support) |
| Background jobs | Order expiry runs on `setInterval` inside the API | A job queue (BullMQ) or a cron worker |
| Frontend tests | None | Playwright + axe accessibility checks in CI |
| Observability | Structured JSON logs only | Sentry, metrics, alerting |
| Missing store features | No coupons, reviews, returns workflow, guest checkout or tax invoices | List them as a roadmap in the README |

---

## 10. Interview questions you should be ready for

1. **"Why HttpOnly cookies instead of localStorage for JWTs?"** XSS can't read them. Pair this with SameSite=Strict and the Origin guard for CSRF.
2. **"How does refresh-token rotation work, and why Lua?"** Compare-and-swap must be atomic across concurrent tabs or instances. There is a short grace window for legitimate parallel refreshes. A replay outside that window means theft, so the session is killed.
3. **"How do you stop overselling?"** Conditional atomic `$inc` (`stock >= qty`) per line, rollback on shortfall, and release exactly once.
4. **"What if the user double-clicks Pay?"** Idempotency key + unique index; the loser of the race returns the winner's order.
5. **"How do you trust a payment?"** Never trust the browser alone. Verify the HMAC or signature over the raw body, re-check capture with the gateway, compare amount and currency, and deduplicate webhook events.
6. **"Why integer paise?"** Floating-point rounding errors in money.
7. **"Why presigned uploads?"** The API stays stateless and cheap. The signature binds size and type, so clients can't upload arbitrary files.
8. **"How would this scale?"** The API is stateless (sessions live in Redis), so you can run several instances behind a load balancer. The Redis lock makes background sweeps run once. Catalog reads can go through a CDN.
9. **"What would you do next?"** Pick from §9. Having a prioritized list shows maturity.

---

## 11. Final verdict

| Criterion | Rating |
|---|---|
| Code quality (strict TS, lint-clean, modular services) | ⭐⭐⭐⭐⭐ |
| Security engineering | ⭐⭐⭐⭐⭐ for a POC (gaps are known and explainable) |
| Commerce correctness (money, stock, payments) | ⭐⭐⭐⭐⭐ |
| Testing and CI | ⭐⭐⭐⭐ (backend excellent, no frontend/E2E) |
| Feature breadth | ⭐⭐⭐⭐ (core flows complete; standard extras missing) |
| Presentation (README, demo, naming) | ⭐⭐ ← **the only thing holding it back** |

**Overall: resume-ready as a POC once you add the README, fix the "AI" naming, merge to `master` and (ideally) deploy a demo.** The engineering depth (atomic session rotation, idempotent checkout, verified payment webhooks, real-database integration tests) is senior-level talking material. Make the repo look as good as the code is.
