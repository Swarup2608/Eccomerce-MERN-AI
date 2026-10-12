# Complete Website Audit — Storefront, Admin, API, Platform

**Date:** 2026-10-12
**Scope:** Whole monorepo: `backend/` (Express 5 API), `storefront/` (Next.js), `admin/` (Next.js), `.github/` CI.
**Companion reports:** [AUTH-SECURITY-AUDIT.md](AUTH-SECURITY-AUDIT.md) (authentication in depth) · [SHOPPING-AUDIT.md](SHOPPING-AUDIT.md) (cart, checkout, payments, orders in depth). This document summarises both and adds frontend, SEO, performance, accessibility, compliance and operations.

| Check | Result |
|---|---|
| `npm run lint` (all workspaces) | ✅ pass |
| `npm run typecheck` | ⚠️ admin failed on stale `.next` route types; passes after `next typegen` (W-1) |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| `npm test -w backend` | ⏭️ not run for this audit |

---

## 1. Scorecard (ranked)

| Rank | Area | Score | One-line verdict |
|---|---|---|---|
| 1 | Checkout & price integrity | **9 / 10** | Server-side pricing, atomic stock, idempotent orders |
| 2 | Web security headers / CSP / CSRF | **9 / 10** | Nonce CSP + `strict-dynamic`, HSTS preload, Origin guard, SameSite=Strict |
| 3 | Injection & input validation | **9 / 10** | Zod `.strict()`, `sanitizeFilter`, `$`/dotted/`__proto__` keys rejected |
| 4 | Payments & webhooks | **8.5 / 10** | Signed webhooks, server-side capture check, event dedupe, late-payment auto-refund |
| 5 | Session design | **8.5 / 10** | HttpOnly rotating refresh, reuse detection, server-side revocation |
| 6 | File uploads | **8.5 / 10** | Presigned PUT with signed type/size, magic-byte check, orphan cleanup |
| 7 | Code quality & tests | **7.5 / 10** | Strict TS, real Mongo/Redis integration tests; no frontend/E2E tests; CI typecheck fragile |
| 8 | Order lifecycle & admin tools | **7 / 10** | Clean state machine; no returns, RBAC, bulk ops or reports |
| 9 | SEO | **5.5 / 10** | Per-page titles, robots rules; no sitemap, canonical, structured data |
| 10 | Performance | **5.5 / 10** | Every page forced dynamic; original-size images served |
| 11 | Abuse / bot protection | **5 / 10** | No CAPTCHA, attacker-triggerable lockout, no open-order caps |
| 12 | Accessibility | **5.5 / 10** | Semantic HTML and labels in places; not audited, no a11y tests |
| 13 | Feature completeness | **5 / 10** | Core shop works; most standard store features missing |
| 14 | Operations & observability | **4.5 / 10** | Structured logs + audit trail; no error tracking, metrics, alerts, job runner |
| 15 | Legal & compliance (India) | **3.5 / 10** | No GST invoices, policy pages, consent, data export/deletion |

### Overall: **7 / 10**

The security engineering and the money path are well above typical MERN projects. The site is **not launch-ready** because of (a) three unfixed auth findings that let attackers lock accounts and weaken the admin, (b) stock-hoarding and refund edge cases in commerce, and (c) missing legal/operational basics (GST invoices, policy pages, monitoring).

---

## 2. Architecture snapshot

```
 shop.example.com (Next.js storefront)      admin.example.com (Next.js admin)
   nonce CSP, guest cart in localStorage      nonce CSP, noindex, client-side gate
              │ fetch(credentials: "include")            │
              └──────────────────┬───────────────────────┘
                                 ▼
                     api.example.com (Express 5)
  helmet · no-store · CORS · originGuard · rate limit (Redis) · JSON 100kb · rejectUnsafeKeys
  /auth  /admin/auth  /admin/*  /products  /categories  /cart  /wishlist  /addresses  /orders  /webhooks
                                 │
         ┌───────────────┬───────┴───────┬────────────────┬──────────────┐
         ▼               ▼               ▼                ▼              ▼
     MongoDB          Redis          Cloudflare R2    Razorpay/Stripe   SMTP
  users, orders,   sessions, rate    product images   payments,         emails
  catalog, audit   limits, OTPs      (presigned PUT)  refunds, webhooks
```

---

## 3. Blocking issues (fix before launch)

| ID | Severity | Issue | Detail |
|---|---|---|---|
| H-1 | High | 3 wrong passwords lock any account (admin included) for 24 h and revoke all sessions | Still `MAX_WRONG_ATTEMPTS = 3` at [auth.service.ts:70](backend/src/modules/auth/auth.service.ts#L70) — see AUTH audit |
| S-1 | High | Unlimited COD / pending orders let one account hoard all stock | See SHOPPING audit |
| M-1 | Medium | Admin change-password accepts 8-char passwords (policy is 12) | [auth.controller.ts:94](backend/src/modules/auth/auth.controller.ts#L94) |
| M-2 | Medium | Attacker-controlled names (URLs, newlines) emailed from your domain | [user.validation.ts:55](backend/src/modules/users/user.validation.ts#L55) |
| S-2 | Medium | Failed refunds can never be retried | [order.service.ts:357](backend/src/modules/orders/order.service.ts#L357) |
| S-3 | Medium | Wrong-amount payments are kept and never refunded | [order.service.ts:323](backend/src/modules/orders/order.service.ts#L323) |
| S-4 | Medium | Razorpay verify errors hidden behind "Your cart is empty" | [checkout-view.tsx:56](storefront/src/app/checkout/checkout-view.tsx#L56) |
| W-1 | Medium | CI typecheck depends on untracked generated Next types | below |
| L-1 | Legal | No GST tax invoices; no refund/shipping/privacy/terms pages | below |

---

## 4. Website findings (not covered in the other two audits)

### W-1 — Frontend typecheck depends on generated files CI never creates (Medium)
**Where:** [.github/workflows/ci.yml](.github/workflows/ci.yml), `admin/tsconfig.json`, `storefront/tsconfig.json`

Pages use the global `PageProps<"/route">` type, which only exists after Next generates `.next/types` and `next-env.d.ts` (both untracked). CI runs `npm ci && npm run typecheck` with no build or typegen step, so it either fails on a clean runner or checks against nothing. Locally, admin typecheck failed because `.next/dev/types` was stale (no `/products/[id]`) and passed after `npx next typegen`.
**Fix:** make each frontend's script `"typecheck": "next typegen && tsc --noEmit"`.

### W-2 — Every page is rendered dynamically (Medium, performance)
**Where:** [storefront/src/app/layout.tsx](storefront/src/app/layout.tsx) (`await connection()`)

The nonce CSP requires each response to be rendered per request, so the home page, product listings and product pages get no static or ISR caching. Every visitor costs a server render plus API calls (`revalidate: 60` only helps the fetch layer), and TTFB rises under load.
**Fix (pick one):** keep the nonce CSP only for checkout/account routes and serve catalogue pages statically with a hash-based CSP; or put a CDN in front with short `s-maxage` for anonymous catalogue HTML (the nonce then repeats within the cache window, which is an accepted trade-off for public, script-only-from-self pages).

### W-3 — Original-size product images served to shoppers (Medium, performance)
**Where:** [storefront/src/components/ui.tsx:55-59](storefront/src/components/ui.tsx#L55-L59)

Product photos are plain `<img>` pointing at the R2 original (up to 5 MB each), with no `srcset`, resizing or format negotiation. A product grid of 8 cards can transfer tens of MB on mobile, which hurts LCP and conversion.
**Fix:** Cloudflare Image Resizing / R2 + Images in front of the bucket (e.g. `/cdn-cgi/image/width=400,format=auto/`), emit `srcset`/`sizes`, and set `width`/`height` to avoid layout shift. Or `next/image` with the R2 origin whitelisted.

### W-4 — Backend health shown to shoppers (Low)
**Where:** [storefront/src/app/page.tsx](storefront/src/app/page.tsx), [status-badge.tsx](storefront/src/components/status-badge.tsx)

The home page header shows "All systems operational / API unreachable". This is useful in development but leaks infrastructure state to visitors and attackers and looks unfinished. **Fix:** render only when `NODE_ENV !== "production"`.

### W-5 — SEO gaps (Low–Medium)
Present: per-page titles/descriptions, product `openGraph.images`, `robots.ts` disallowing `/account`, `/checkout`, `/api`, `noindex` on private pages, breadcrumbs.
Missing:
- `sitemap.ts` (products + categories)
- `alternates.canonical` on product and listing pages (filter/sort query strings create duplicate URLs)
- JSON-LD `Product` / `Offer` / `BreadcrumbList` / `Organization` structured data (rich results: price, stock)
- `metadataBase`, real site name (title template is "Storefront"), default OG image, favicon/manifest
- Category landing pages with their own URL (`/c/<slug>`) instead of `?category=`

### W-6 — Accessibility not verified (Low–Medium)
Present: `lang="en"`, labelled form fields, radio inputs for address/payment, breadcrumb `nav aria-label`, `role="status"`.
Not verified / likely gaps: colour contrast of `text-black/50` secondary text (~4.0:1, below AA for small text), visible focus styles, keyboard flow through the Razorpay modal and gallery, `aria-live` for cart-updated and form-error messages, skip-to-content link. **Fix:** run axe / Lighthouse in CI (Playwright + `@axe-core/playwright`) and fix contrast tokens.

### W-7 — Admin protected only by client-side gate + API (Info)
The admin Next app renders its shell to anyone; the API enforces everything (correct). With `ADMIN_ALLOWED_IPS` optional and email OTP the only factor, the admin login is internet-facing. **Fix:** make the IP allow-list or Cloudflare Access mandatory in production; add TOTP/passkeys for admins.

### W-8 — Public health endpoint detail (Low)
`/health/ready` reports dependency status to anyone. Keep `/health/live` public; restrict `/health/ready` to the load balancer network or strip component detail.

---

## 5. Security summary (all layers)

**Strong**
- Separate user/admin token scopes, secrets, audiences, cookie names and paths
- Refresh-token rotation with reuse detection; revocation checked on every request
- Enumeration-safe registration, login and reset (neutral answers, dummy hash timing)
- Nonce CSP + `strict-dynamic` on both frontends; API CSP `default-src 'none'`
- Origin guard on unsafe methods + SameSite=Strict + JSON-only bodies (CSRF)
- NoSQL-injection hardening at three layers; `query parser: simple`
- Rate limiting in Redis (auth limiter fails closed), IPv6 /64 grouping, explicit `TRUST_PROXY`
- Zod-validated env with production guards; secrets never logged
- Signed payment webhooks with raw-body verification and dedupe
- Upload type/size bound into the presigned signature + magic-byte verification
- Dependabot + `npm audit` in CI; 0 known prod vulnerabilities

**Weak / missing**
- Attacker-triggerable lockout (H-1), no CAPTCHA/Turnstile, reset-email flooding
- Email OTP is the only MFA; no TOTP / WebAuthn; admin IP allow-list optional
- Single `admin` role: no least-privilege roles, no admin user management
- No audit-log viewer; security events depend on an external log pipeline for alerts
- No CodeQL / secret scanning / container scanning in CI
- Redis scripts not Redis-Cluster safe (conditional)
- No WAF / bot management in front of the API

---

## 6. Everything that is missing

### Customer account
- TOTP / passkey MFA · active sessions & devices list · change email · change/verify phone
- Account deletion and personal-data export (DPDP Act 2023 / GDPR)
- Communication preferences (marketing opt-in/out)

### Shopping
- Guest checkout · coupons/promotions · gift cards/store credit/wallet
- Product reviews & ratings · Q&A · size guides
- Search autocomplete, typo tolerance, attribute facets · recommendations · recently viewed
- Back-in-stock and price-drop alerts · abandoned-cart emails
- Pincode serviceability, delivery ETA, zone/weight-based shipping
- Customer returns/exchanges · partial cancellation · reorder
- GST invoice PDF · courier integration & auto tracking · SMS/WhatsApp notifications

### Admin
- RBAC (support / warehouse / finance / super-admin) · admin user invites & revocation
- Audit-log viewer · refund-failure queue · payment reconciliation & settlement report
- Bulk order actions, packing slips, shipping labels · CSV import/export (products, stock, orders)
- Inventory ledger · customer notes & fraud flags · coupon management · CMS for banners/pages
- Analytics beyond 30-day revenue (conversion funnel, AOV, top products, RTO rate)

### Website / frontend
- Sitemap, canonical URLs, JSON-LD, brand metadata, favicon/manifest
- Image resizing/CDN · static/ISR catalogue pages
- Policy pages: privacy, terms, refund/return, shipping, cancellation, contact/grievance officer (required by Indian e-commerce rules and by Razorpay/Stripe onboarding)
- Cookie/analytics consent · analytics (GA4/Plausible) and conversion tracking
- PWA / offline shell (optional) · i18n / multi-currency (optional)

### Platform & operations
- Error tracking (Sentry) for API and both frontends · metrics & dashboards (OpenTelemetry/Prometheus)
- Alerts: payment mismatch, refund failure, webhook signature failures, 5xx rate, queue lag
- Dedicated job runner/queue (BullMQ) for expiry sweeps, upload cleanup, emails with retry
- Transactional email provider with bounce/complaint handling, SPF/DKIM/DMARC
- MongoDB backups + tested restore; Redis persistence policy
- Dockerfiles / IaC / deployment pipeline; staging environment
- Frontend unit tests, Playwright E2E (register → buy → refund), axe a11y checks, Lighthouse budgets
- Load test of checkout and catalogue · CodeQL + secret scanning in CI

---

## 7. Prioritised roadmap

**Phase 1 — before launch (blocking)**
1. H-1 lockout redesign, M-1 admin password schema, M-2 name validation
2. S-1 open-order caps + checkout rate limit + COD confirmation; lower COD limit
3. S-2 / S-3 refund correctness; S-4 checkout error routing
4. W-1 CI typegen fix
5. Policy pages + GST invoice
6. Mandatory admin IP allow-list / Cloudflare Access in production
7. Sentry + alerts on payment/refund/webhook anomalies; Mongo backups

**Phase 2 — first month**
- CAPTCHA/Turnstile, TOTP for admin, reset-email throttling per account
- Image resizing (W-3), catalogue caching (W-2), sitemap/canonical/JSON-LD (W-5)
- Returns workflow, courier integration, SMS notifications
- Playwright E2E + axe checks in CI

**Phase 3 — growth**
- Coupons, guest checkout, reviews, search upgrade, abandoned-cart emails
- RBAC + admin user management + audit-log viewer
- Reconciliation reports, inventory ledger, CSV import/export, analytics

---

## 8. Production launch checklist

- [ ] All Phase 1 items done
- [ ] `NODE_ENV=production`, `TRUST_PROXY` correct for the load balancer, `API_PUBLIC_URL` set (same-site check passes)
- [ ] Storefront, admin and API on the same registrable domain over HTTPS; HSTS preload submitted only after verifying all subdomains are HTTPS
- [ ] Fresh 48-byte secrets for both token scopes; test gateway keys replaced by live keys; webhooks registered with live secrets
- [ ] R2 bucket CORS limited to the admin origin; public bucket domain behind Cloudflare
- [ ] SMTP provider with SPF, DKIM, DMARC; bounce handling
- [ ] Mongo user with least privilege; Redis with auth + TLS (`rediss://`)
- [ ] Admin seeded with a 12+ char unique password; break-glass scripts restricted to operators
- [ ] Backups scheduled and one restore tested
- [ ] Error tracking, uptime checks and alerts live
- [ ] Lighthouse ≥ 90 performance/accessibility on home, listing, product, checkout
