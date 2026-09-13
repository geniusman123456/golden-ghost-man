# Golden Ghost V33 — Final Candidate

This release builds on V33 and fixes the Railway `GET / -> 404` issue with an explicit public `/` route.

## Included
- Universal login: User/Admin in one entry.
- Email verification and password reset flows.
- Membership plans: Free, Plus, Premium.
- Admin + User dashboards and community features.
- PWA manifest/service worker.
- Bilingual auto-translation helper (Swahili/English) with language detection and selector.
- Public landing page served explicitly at `/`.
- `/healthz` health endpoint.
- Real-data principle: dashboards show backend data or `—`; no fabricated activity/statistics.

## Railway
Set `SESSION_SECRET` and other secrets as Railway Variables. Do not commit `.env`.

## Database note
This candidate inherits the V33 SQLite database layer. For a durable production launch on Railway, move persistence to Supabase/PostgreSQL before treating the app as production-grade.
