# Shopping & Checkout Audit — Cart, Orders, Payments, Fulfilment

**Date:** 2026-10-12
**Scope:** Cart, checkout, stock reservation, Razorpay / Stripe / COD payments, webhooks, refunds, order lifecycle, admin order tools, storefront checkout UI.
**Method:** Read `backend/src/modules/{cart,orders,payments,products/stock.ts,admin}` and `storefront/src/{app/checkout,lib/cart.ts,lib/payments.ts}` line by line and traced each money and stock path.

| Check | Result |
|---|---|
| `npm run lint` (all workspaces) | ✅ pass |
| `npm run typecheck` | ⚠️ passes only after `next typegen` (see [WEBSITE-AUDIT.md](WEBSITE-AUDIT.md) W-1) |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| `npm test -w backend` | ⏭️ not run for this audit |

---

## 1. Verdict

| Area | Score | Notes |
|---|---|---|
| Price & cart integrity | **9 / 10** | Prices always from DB, never from the client; cart re-priced on every read |
| Stock reservation | **8 / 10** | Atomic conditional `$inc` per line, all-or-nothing, released once via `stockReleased` flag; not crash-safe |
| Checkout idempotency | **9 / 10** | Browser UUID key + unique index + race recovery; retries return the same order |
| Payment verification | **8.5 / 10** | Razorpay signature + server-side capture check; Stripe signed webhooks; amount & currency checked |
| Webhooks | **8.5 / 10** | Raw-body signatures, per-event dedupe with retry-on-failure, own rate limit |
| Refunds | **6.5 / 10** | Atomic reservation prevents over-refund; failed refunds get stuck; mismatched payments never refunded |
| Abuse resistance | **4 / 10** | No cap on open orders → stock can be hoarded via COD / pending orders |
| Order lifecycle | **7 / 10** | Clean state machine; no returns flow, partial fulfilment or courier integration |
| Checkout UX | **6.5 / 10** | Clear and safe, but payment-verification errors are hidden behind an "empty cart" screen |
| Feature completeness | **4.5 / 10** | No coupons, guest checkout, GST invoices, reviews, returns, shipping rules |

### Overall: **7 / 10** — the money path is engineered correctly; abuse controls and post-purchase workflow are not launch-ready.

**Fix before launch (blocking):**
1. [S-1] Unlimited COD / pending orders let one account lock up all stock.
2. [S-2] A refund the gateway reports as failed can never be retried.
3. [S-3] A payment with a mismatched amount is kept and never refunded.
4. [S-4] Razorpay verification failure shows "Your cart is empty" instead of the error.
5. GST-compliant tax invoice (legal requirement for Indian e-commerce).

---

## 2. How it works

### 2.1 Checkout flow

```
POST /api/v1/orders  { addressId, paymentMethod, idempotencyKey }
  1. replay?  findOne({user, idempotencyKey}) → return existing order (+ payment handle)
  2. load address, user, cart → CartService.price()  (live price, status, stock)
  3. any line not "ok" → 409 CART_HAS_ISSUES
  4. totals: subtotal + shippingFor(subtotal)   (₹49 fee, free from ₹499)
  5. COD over ₹50,000 → 422 COD_LIMIT
  6. reserveStock()  — conditional $inc per line, rollback on shortfall
  7. insert Order   — COD: "confirmed";  online: "pending_payment", expiresAt = now + 45 min
       duplicate idempotencyKey → release stock, return the winner
  8. online: gateway.createPayment() — failure → cancel order (stock back)
  9. remove purchased SKUs from cart, audit "order_placed", COD → confirmation email
```

### 2.2 Payment confirmation

| Path | Trigger | Verification |
|---|---|---|
| Razorpay browser callback | `POST /orders/:id/payments/razorpay/verify` | HMAC signature + `providerOrderId` match + `confirmPayment()` against Razorpay API |
| Razorpay webhook | `payment.captured` / `payment.failed` / `refund.*` | `x-razorpay-signature` over raw body; event-id dedupe |
| Stripe webhook | `checkout.session.completed` / `async_payment_*` / `expired` / `refund.*` | `constructEvent` (signature + timestamp); event-id dedupe |

`markPaid()` is idempotent and order-independent: it moves `pending_payment → confirmed` atomically; if the order was already cancelled it records the payment and auto-refunds it.

### 2.3 Order state machine ([order.policy.ts](backend/src/modules/orders/order.policy.ts))

```
pending_payment ──► confirmed ──► processing ──► shipped ──► delivered ──► returned
      │                 │              │
      └────────────► cancelled ◄───────┘   (customer may cancel up to "processing")
```

- Cancelling: one atomic status flip → stock released once → open checkout closed → paid amount refunded.
- `shipped` requires tracking (https link only). `delivered` marks COD as paid. `returned` releases stock but **does not refund**.
- Stale `pending_payment` orders are swept by a `setInterval` in [server.ts](backend/src/server.ts) (100 per tick).

### 2.4 Already strong (keep it)

- Prices, stock and availability are never trusted from the cart or client ([cart.service.ts](backend/src/modules/cart/cart.service.ts)).
- Integer paise everywhere; no float money.
- Refund reservation uses `$expr` so two admins can't refund more than was paid ([order.service.ts:550-556](backend/src/modules/orders/order.service.ts#L550-L556)).
- Gateway refund calls carry deterministic idempotency keys.
- Customers can only see their own orders (`{_id, user}` filter → 404 otherwise).
- Admin-only notes are hidden from customers in `statusHistory`.
- Order numbers use an unambiguous alphabet with crypto randomness.
- Stripe checkout session expiry is tied to the stock hold.
- Late payments on cancelled orders are refunded automatically.

---

## 3. Findings

### HIGH

#### S-1 — Inventory hoarding: unlimited open orders per account
**Where:** [order.service.ts:179-260](backend/src/modules/orders/order.service.ts#L179-L260), [order.policy.ts](backend/src/modules/orders/order.policy.ts), [cart.model.ts](backend/src/modules/cart/cart.model.ts) (`MAX_CART_LINES = 50`, `MAX_LINE_QUANTITY = 10`)

A COD order reserves stock immediately with status `confirmed` and **never expires**. There is no limit on how many open COD orders an account may hold, and checkout has no rate limit beyond the global 120 req/min/IP. One verified account can place repeated COD orders (up to 500 units / ₹50,000 each) and empty the catalogue until an admin cancels each one. Online orders hold stock for 45 min each, also with no per-user cap, so scripted "add → checkout → abandon" loops keep products permanently out of stock.

**Fix:**
- Cap open orders per user (e.g. ≤ 3 `pending_payment`, ≤ 2 unshipped COD) and per address/phone.
- Dedicated checkout rate limit per user and per IP (e.g. 10 / hour).
- COD confirmation: phone OTP at checkout, or keep COD orders in `pending_confirmation` with a TTL until confirmed by SMS/IVR.
- Lower `COD_MAX_TOTAL` (S-7) and require ≥ 1 delivered prepaid order for high-value COD.
- Admin view of "open orders per customer" and bulk-cancel.

### MEDIUM

#### S-2 — Failed refunds are stuck forever
**Where:** [order.service.ts:357-359](backend/src/modules/orders/order.service.ts#L357-L359)

`issueRefund()` increments `amountRefunded` before calling the gateway. If the gateway later reports the refund as **failed** (`refund.failed` / Stripe `failed`), `updateRefundStatus()` only flips that refund's `status`. `amountRefunded` and `payment.status` (`refunded`) stay as they were, so `refundableOf()` returns 0 and the admin gets "There is nothing left to refund" while the customer never received the money.

**Fix:** on a failed refund, atomically `$inc: { "payment.amountRefunded": -amount }`, recompute `payment.status`, audit `refund_failed`, and alert the admin. Show failed refunds prominently on the admin order page with a "Retry refund" button.

#### S-3 — Payment with the wrong amount is kept and never refunded
**Where:** [order.service.ts:323-327](backend/src/modules/orders/order.service.ts#L323-L327)

When the captured amount or currency doesn't match, the code records `lastError` and returns. Payment status stays `pending`, the order then expires and is cancelled, and since `refundableOf()` requires `paid`, nothing is refunded. The customer is charged and receives nothing. Rare (needs a gateway-side edit or misconfiguration), but every occurrence is real money owed.

**Fix:** record the payment as `paid` with the received amount on the order (or a separate `unmatchedPayments` array) and auto-refund it in full, as the late-payment path already does. Alert on `payment_amount_mismatch`.

#### S-4 — Razorpay verification errors are invisible to the customer
**Where:** [checkout-view.tsx:56-66](storefront/src/app/checkout/checkout-view.tsx#L56-L66), [checkout-view.tsx:84](storefront/src/app/checkout/checkout-view.tsx#L84)

After the order is created, `refreshCart()` empties the cart **before** the Razorpay modal opens. The component then renders the "Your cart is empty" branch, which returns before `<FormError>`. If `verifyRazorpay` rejects (e.g. `402 PAYMENT_NOT_CAPTURED` for a UPI payment still processing), the error is set but never shown, and the customer is not sent to the order page. They see an empty cart after paying, which leads to duplicate orders and support tickets.

**Fix:** on any error after the order exists, `router.push(/account/orders/:id)` with a "payment pending" notice (the order page already polls / shows status). Alternatively, refresh the cart only after the payment outcome is known.

#### S-5 — `returned` doesn't refund, and there is no returns workflow
**Where:** [order.service.ts:416](backend/src/modules/orders/order.service.ts#L416)

Marking an order `returned` restocks every item but leaves payment untouched; the admin must remember a second, separate refund action. Customers cannot request a return or exchange at all; there is no return window, reason, pickup, QC or partial-item return.

**Fix:** add `return_requested → return_approved → picked_up → returned/refunded` statuses with per-item quantities, a configurable return window (e.g. 7 days after delivery), and an automatic refund prompt when an order reaches `returned`.

### LOW

#### S-6 — Second payment on a confirmed order is silently dropped
**Where:** [order.service.ts:330-347](backend/src/modules/orders/order.service.ts#L330-L347)
A captured payment with a new `providerPaymentId` on an order that is already `confirmed` (double payment across two attempts) matches neither update, so it is neither refunded nor logged. **Fix:** log + audit + auto-refund any captured payment that doesn't move the order.

#### S-7 — COD limit is very high
`COD_MAX_TOTAL = 5_000_000` (₹50,000), although the comment says COD is for smaller orders. COD RTO (return-to-origin) losses at that ticket size are severe. **Fix:** ₹5,000–10,000, configurable via env.

#### S-8 — Stock leak on crash between reserve and insert
**Where:** [order.service.ts:209-216](backend/src/modules/orders/order.service.ts#L209-L216), [stock.ts](backend/src/modules/products/stock.ts)
Stock is decremented before the order exists; a process crash in between loses that stock permanently. **Fix:** Mongo transaction around reserve + insert, or a nightly reconciliation job (stock + open-order quantities = expected).

#### S-9 — Background jobs run inside every API instance
The payment-expiry sweep is a `setInterval` in `server.ts`. With N instances it runs N times (safe because updates are conditional, but wasteful), and stops entirely if the API is scaled to zero. **Fix:** a single scheduled worker or a Redis lock around the sweep.

#### S-10 — No stock-movement history
Admin stock edits overwrite `variants.stock` with no ledger. **Fix:** an `inventory_movements` collection (sale, cancel, return, manual adjust, with actor) for audits and shrinkage tracking.

#### S-11 — Razorpay webhook event id fallback
If `x-razorpay-event-id` is missing the key becomes `event:paymentId`, which is fine for payments but collapses repeated `refund.*` updates for the same refund. Low impact; prefer requiring the header.

---

## 4. What is missing (features)

### Cart & checkout
- Guest checkout (guest cart exists, but checkout forces sign-in)
- Coupons / promo codes / automatic discounts (`pricing.discount` is always 0)
- Pincode serviceability check and delivery-date estimate before payment
- Shipping rules by weight, zone or category (currently one flat fee)
- Saved-for-later, cart expiry notices, price-change notice in cart
- Abandoned-cart reminder emails
- Gift wrap / order notes / GSTIN entry for B2B buyers
- UPI intent / saved methods (delegated to gateways, OK)

### Post-purchase
- **GST tax invoice PDF** (seller GSTIN, HSN/SAC, CGST/SGST/IGST split, invoice number series), downloadable by customer and admin
- Customer return / exchange requests with reasons and photos
- Partial cancellation (one item of several)
- Courier integration (Shiprocket / Delhivery): label generation, AWB, automatic status sync, "out for delivery"
- SMS / WhatsApp order notifications (email only today)
- Reorder button, order-related support tickets

### Catalogue & discovery
- Product reviews and ratings (with verified-purchase badge)
- Back-in-stock alerts, low-stock "only N left" urgency (data exists)
- Search autocomplete, typo tolerance, facets by attribute (only Mongo `$text`)
- Related / recommended products, recently viewed

### Admin operations
- Roles: support, warehouse, finance (only one `admin` role)
- Bulk order actions (mark processing/shipped), packing slips, pick lists
- Payment reconciliation report (gateway settlements vs. orders), CSV export
- Refund-failure queue, COD remittance tracking
- Inventory ledger, CSV bulk import/export of products and stock
- Customer notes, fraud flags (high RTO rate, many cancelled COD orders)

---

## 5. Launch checklist (shopping)

- [ ] S-1 open-order caps + checkout rate limit + COD confirmation
- [ ] S-2 failed-refund rollback + retry
- [ ] S-3 auto-refund mismatched payments
- [ ] S-4 send customer to order page on any post-order error
- [ ] GST invoice generation
- [ ] `COD_MAX_TOTAL` lowered and env-configurable
- [ ] Razorpay and Stripe webhooks registered in live mode with the production URL; secrets rotated from test values
- [ ] Alerting on `payment_amount_mismatch`, `refund failed`, `Automatic refund failed`, `webhook_signature_invalid`
- [ ] Return / refund / shipping / cancellation policy pages linked from checkout (also required by Razorpay KYC)
- [ ] End-to-end test: place → pay (Razorpay test mode) → ship → deliver → return → refund
