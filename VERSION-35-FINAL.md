# Golden Ghost V35 — FINAL PWA/Cross-Device Candidate

- One unified web app for phone, tablet, desktop.
- PWA manifest + service worker + install banner.
- Explicit `/` route and robust public-root discovery.
- Universal User/Admin authentication architecture retained.
- Email verification, password reset, membership, community, messaging and admin pages retained.
- No invented dashboard numbers; unavailable metrics show `—`.
- Railway-ready with port from `PORT` (default 8080) and `0.0.0.0` binding.

## Database note
The current app retains the existing SQLite/sql.js data layer for local portability. For durable production persistence on an ephemeral host, migrate the data layer to a managed PostgreSQL service such as Supabase before treating the deployment as a long-term production datastore.
