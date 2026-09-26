# Riwaq integrations — implementation checklist

## Selected scope
- [x] User selected a lesson assistant and both communications channels (SMS + email).
- [x] OpenAI lesson assistant: use authenticated, server-side calls, strict size limits, Arabic responses, and only course titles/topics currently available to the prototype.
- [x] Twilio Messaging: store phone preferences, require explicit SMS consent, and send only user-requested test messages; do not enable automated campaigns.
- [x] Twilio SendGrid: store email preferences and send only user-requested test messages to the signed-in user's account email.
- [x] Validate third-party configuration on the server; never put keys in browser bundles or log them.

## Verification
- [x] Add consent, input validation, prompt-building, provider response/error, and notification-gate unit tests.
- [x] Run `pnpm check`, `pnpm test`, and `pnpm build`.
- [x] Verify feature messaging remains clear when provider credentials are missing.

## Activation status
- The secure project-secret request was declined on 2026-09-26. The code and offline provider mocks are tested, but no live API key or provider request was verified. Add credentials in project Secrets when ready; then run provider-specific health/smoke tests.

## Pending / limitations
- [ ] Stripe Checkout is not implemented yet: its WebDev scaffold is region-gated. Enable it through project Settings → Payment with test-mode keys, then configure server-side fulfillment/webhooks before any real course-access grants.
- [ ] Course catalog, enrollment, course lessons, and notification triggers in the current website remain demo/front-end state. Do not claim durable purchases, lesson-content retrieval, or automatic transactional sends until those entities are persisted.
- [ ] Before live SMS, configure a Twilio Messaging Service with an eligible, country-compliant sender and verify the specific market's regulations and rates.
