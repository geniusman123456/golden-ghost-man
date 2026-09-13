# GOLDEN GHOST V33 — UNIFIED CLOUD-READY

Golden Ghost V33 ni package moja yenye User + Admin ndani ya application moja.

## Vipengele vikuu
- Universal login: admin/user wanaingia kupitia `/login.html`; role inaamua dashboard.
- Email verification kabla ya user kuingia.
- Resend email integration kwa verification na password reset.
- Password reset flow: forgot → email → reset.
- Rate limiting kwa auth/API.
- Helmet/security headers.
- Session idle + absolute timeout.
- User dashboard, communities, discover, direct messages, notifications.
- Admin dashboard, users, admins, communities, transactions, payments, reports, security, settings.
- Membership tiers: Free / Plus / Premium data model.
- Payment architecture imeachwa disabled mpaka provider halisi iwe configured; hakuna fake payment success.
- PWA assets na responsive dark/gold UI.
- Railway + Docker deployment files.
- Health endpoint: `/api/health`.

## Muhimu kuhusu database
V33 ya package hii hutumia SQLite local (`data/golden-ghost.db`) kwa compatibility na offline/local use.
Kwa cloud yenye data ya kudumu, tumia persistent storage/managed PostgreSQL adapter kabla ya production scale. Usitumie SQLite kwenye ephemeral free container kama source-of-truth ya production.

## Local
1. Node.js 22+
2. `npm install`
3. Copy `.env.example` → `.env`
4. Weka `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
5. Kwa email: `RESEND_API_KEY`, `MAIL_FROM`, `APP_BASE_URL`.
6. `npm run verify`
7. `npm start`
8. Fungua `http://localhost:3000/login.html`

## Email provider
Resend inatumika kupitia HTTPS API bila dependency ya ziada. Weka:
- `RESEND_API_KEY`
- `MAIL_FROM`
- `APP_BASE_URL`

Kwa development tu unaweza kuweka `DEV_EMAIL_MODE=true`; response itarudisha verification/reset URL ya majaribio. Usitumie hii production.

## Railway
Njia mbili:

### A. GitHub
- New Project → Deploy from GitHub repo
- Chagua repository
- Railway itatumia `npm install` na `npm start`
- Add Variables kutoka `.env.example`
- Generate Domain kwenye Networking

### B. CLI (ikiwa GitHub integration inasumbua)
Ndani ya folder la project:
- `railway login`
- `railway init`
- `railway up`
- `railway domain`

Railway docs pia zinaunga mkono deploy ya Express/Node kutoka GitHub au CLI.

## Health
`https://YOUR-DOMAIN/api/health`

Inapaswa kurudisha JSON yenye `ok:true`.

## Security
- Usipandishe `.env` GitHub.
- Usitume password/API keys kwenye chat.
- Payment provider ibaki `unconfigured` mpaka credentials halisi zipatikane.
