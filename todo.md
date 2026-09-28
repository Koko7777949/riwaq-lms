# Riwaq Stripe course payments

## Scope and implementation
- [x] Hosted Stripe Checkout for one-time purchases of the six catalog courses at fixed server-owned SAR prices.
- [x] Require a signed-in student; browser input selects only a known course ID, while price/metadata are set server-side.
- [x] Retrieve each Checkout Session through Stripe's authenticated test API before marking an order paid or granting an enrollment; require exact Session/order/user/course/amount/currency matching and `livemode=false`.
- [x] Persist orders, checkout attempts, webhook-event compatibility, and enrollments using the existing project tables; preserve idempotent retries and database-transactional entitlement writes.
- [x] Refresh pending orders when the student returns to their learning area, even if the browser-return flow was interrupted.
- [x] Arabic test-mode, pending, success, cancel, and payment-disabled UI states.
- [x] Keep real/live charges disabled; project test API key is installed and verified against Stripe's read-only Balance API. A test Checkout Session was created and immediately expired without a charge.
- [x] Subscriptions intentionally deferred for this course-purchase scope: the product defines no recurring SKU/cadence or subscription entitlement policy.

## Deployment notes
- Existing order, checkout-attempt, webhook-event, and enrollment tables are already applied in the remote DB; do not replay old migrations.
- `RIWAQ_STRIPE_SECRET_KEY` (server-only; `sk_test_…`) is required. Checkout readiness endpoint currently reports `checkoutConfigured=true`, `mode=test`.
- Hosted fulfilment uses the authenticated Stripe API; an incoming webhook endpoint/signing secret is not needed for this implementation.
- Course purchases do not automatically transfer revenue to instructors. The order stores the 10% fee/share for auditing; Stripe Connect onboarding/payouts are not implemented.
- Payment confirmation is reconciled when the student returns or opens their learning area. If a payment finishes long after the user leaves and no return happens, the student must revisit the site to refresh their entitlement.

## Verification
- [x] Tests cover exact SAR minor units/prices, API-key mode, trusted checkout origin, Session ownership and amount binding, paid-only/expired behavior, and webhook compatibility.
- [x] `pnpm check` and `pnpm test` pass (29 tests at latest run).
- [x] `pnpm build` succeeds after API-verified fulfillment changes.
- [x] Desktop/mobile preview checked; banner reports test mode and states that no real charge is made.
- [x] Save a final checkpoint after final checks.
