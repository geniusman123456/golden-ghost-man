# Golden Ghost v13 — Security & Release Candidate Checklist

## Implemented in this release

- [x] User/admin protected routes re-check the current account status from the database.
- [x] Super Admin authorization is re-checked from the database instead of trusting only the session role.
- [x] Successful authentication regenerates the session.
- [x] Session cookie is `HttpOnly` and `SameSite=Lax`; `Secure` is enabled in production.
- [x] Inactivity timeout: 30 minutes by default (`SESSION_IDLE_MS`).
- [x] Absolute authenticated-session lifetime: 24 hours by default (`SESSION_ABSOLUTE_MS`).
- [x] Express `X-Powered-By` fingerprinting is disabled.
- [x] Production reverse-proxy support is enabled with `trust proxy`.
- [x] State-changing API requests with an Origin header must match the application origin.
- [x] Centralized JSON error handler avoids returning raw server errors to clients.
- [x] Passwords remain salted/hashed server-side; plaintext passwords are not stored in the database.
- [x] Payment webhook HMAC verification and payment-event idempotency remain enabled.
- [x] Wallet/payment completion paths retain database-side pending/finalized guards.
- [x] SQL queries use bound parameters for user-controlled values in the reviewed transaction/community/auth paths.
- [x] Real database values are used for dashboard statistics; no launch statistics are fabricated.

## Required before public production launch

- [ ] Replace the default in-memory `express-session` store with a persistent production session store.
- [ ] Run the application only behind HTTPS.
- [ ] Set strong random production secrets and keep `.env` outside source control.
- [ ] Complete provider onboarding/KYB and verify the exact current payment API contract.
- [ ] Test provider callbacks/webhooks against the official sandbox.
- [ ] Add production backup/restore and monitoring.
- [ ] Complete privacy policy, terms, support, dispute/refund, and moderation procedures.
- [ ] Perform a formal penetration test before handling real customer funds.

## Reference

This checklist uses OWASP ASVS 5.0 as the security verification framework. The official ASVS covers authentication, session management, authorization, validation, business logic, API security, logging, and configuration.
