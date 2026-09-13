# Golden Ghost — Final Platform v19

## Hii ndiyo package ya mwisho ya unified platform

Imeunganisha public home, member authentication, user dashboard, wallet, transactions, payment architecture, notifications, profile/settings, global community, discover, connections, direct messages, communities, admin operations, reports, security/system health, QA, and PWA installation.

### Public/member flow
`/` → `GET STARTED` → `/signup.html` → account creation → `/user-dashboard.html`

`/` → `LOGIN` → `/login.html` → `/user-dashboard.html`

### Admin flow
`/admin-login.html` → `/dashboard.html`

### Important
- No fake dashboard statistics are seeded.
- Payment provider defaults to `unconfigured` until official merchant credentials/API contract are supplied.
- AzamPay sandbox configuration fields are included but are not activated automatically.
- PWA caches the app shell, not API responses or login/signup pages.
- Production deployment requires a real server, domain, HTTPS, persistent session storage, backups, and provider credentials.

## First installation

### Windows
1. Extract the ZIP.
2. Double-click `START-WINDOWS.bat`.
3. If this is a new installation, it runs `npm install` and `npm run setup` automatically.
4. Open `http://localhost:3000/`.

### Create a member account at any time
If `.env` already exists, **do not delete it** just to create a user.

Double-click:
`CREATE-USER-WINDOWS.bat`

or run:
`npm run create-user`

This creates a real login account directly in the database, hashes the password, and creates the user's TZS wallet automatically.

## Running

`npm start`

Then open:
`http://localhost:3000/`

## Verification

`npm run verify`

## Production

1. Deploy the Node.js application to a server.
2. Put the app behind HTTPS.
3. Use a persistent session store instead of Express MemoryStore.
4. Keep `.env` and database backups outside the public web root.
5. Configure official payment-provider credentials only after provider onboarding and API contract verification.
6. Set `NODE_ENV=production` and production callback/return URLs.
7. Run `npm run verify` before release.
8. Open the HTTPS domain and install Golden Ghost from the browser's install/PWA option.


## V20 Final Fix — Email iliyotumika
Ikiwa email tayari ipo kwenye database lakini login inakataa, **usifute database na usibadilishe email**.
Windows: double-click `REPAIR-USER-WINDOWS.bat`. Itakurekebishia account iliyopo, itaweka password mpya, na kuhifadhi wallet/transaction history.

Flow ya mwisho: `REPAIR-USER-WINDOWS.bat` → `npm start` → `http://localhost:3000/login.html` → User Dashboard.


V35 FINAL FIX: startup now detects public/index.html directly or inside one accidental wrapper folder, and listens on Railway PORT/0.0.0.0. Correct GitHub layout remains public/ + server.js + package.json at repository root.
