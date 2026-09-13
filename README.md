# Golden Ghost — Unified Platform v13

Golden Ghost is now packaged as **one integrated application** covering the public home, member authentication, social/community features, wallet/transactions, payment architecture, and the protected admin operations side.

## Platform map

```text
Public Home
   ↓
Member Login / Signup
   ↓
User Dashboard
   ├── Wallet
   ├── Transactions
   ├── Payment Center
   ├── Discover People
   ├── Connections
   ├── Direct Messages
   ├── Communities
   ├── Global Chat
   ├── Notifications
   ├── Profile
   └── Settings

Admin Login
   ↓
Admin Dashboard
   ├── Admins & Roles
   ├── Users
   ├── Transactions
   ├── Payments
   ├── Communities / Moderation
   ├── Reports
   ├── Notifications / Activity
   ├── Settings
   ├── Security
   ├── System Health
   └── Final Check
```

## Important entry points

- `/` — public Golden Ghost home
- `/login.html` — main member login (username/email + password)
- `/signup.html` — member registration
- `/user-dashboard.html` — member home
- `/admin-login.html` — separate protected admin login
- `/dashboard.html` — admin dashboard after authentication
- `/admin-communities.html` — admin community moderation

## Member features

- User registration/login/logout
- Profile editing and password change
- Wallet and transaction ledger
- Deposit/withdrawal requests
- Payment Center for Visa, Mastercard, M-Pesa, Airtel Money, Tigo Pesa and Bank Transfer
- Provider abstraction with AzamPay adapter ready for official credentials
- Discover active members from the real database
- Connection requests
- Direct messages
- Communities: create, discover, join/leave, members, posts and comments
- Global chat
- Notifications
- Member settings

## Admin features

- Protected admin authentication
- Admin/super-admin roles
- User management
- Transaction approval/status controls
- Payment Center and provider health check
- Community moderation: enable/disable communities and remove community posts
- Super Admin community deletion
- Reports based on stored database records
- Notifications and activity logs
- System health and final QA pages
- Settings controlled by Super Admin

## Data integrity

The platform does **not** fabricate launch statistics, users, transactions, messages, countries, community counts, revenue or activity. Where the database has no real records, the interface shows an empty state or `—`.

## Payment status

The payment layer is provider-ready but **not live until official merchant/provider credentials are supplied and the exact provider contract is verified**. No fake payment success is generated.

For card payments, use hosted/tokenized provider checkout so Golden Ghost does not store raw PAN/CVV.

## First run

1. Extract the ZIP.
2. Open a terminal in the extracted project directory.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Set a strong `SESSION_SECRET`.
6. Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` for first-run admin bootstrap.
7. Leave `PAYMENT_PROVIDER=unconfigured` until provider onboarding/credentials are complete.
8. Run `npm start`.
9. Open `http://localhost:3000/`.

The first database initialization creates the initial admin from `ADMIN_USERNAME` and `ADMIN_PASSWORD` only when there are no admins yet.

## Production switch-on checklist

Before public launch:

- HTTPS/TLS on the whole application
- persistent production session store instead of the default in-memory session store
- strong randomly generated secrets
- official payment-provider onboarding/KYB
- exact provider webhook/callback verification
- reconciliation and refund procedures
- monitoring and backups
- moderation/support process
- privacy/terms/legal review
- production database strategy

V13 adds release-candidate hardening: server-side revalidation of active users/admins on protected requests, inactivity and absolute session limits, production proxy awareness, a same-origin guard for state-changing API requests, disabled Express fingerprinting, centralized JSON error handling, and stronger session timestamps. These controls are aligned with OWASP ASVS 5.0 areas for authentication, session management, authorization, validation, business logic, and logging. OWASP recommends secure session cookies, server-side authorization and session renewal after authentication. See the official guidance: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html and https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html.


## Muhimu wakati wa ku-login
Usifungue `public/index.html` au `public/login.html` kwa double-click. Tumia server: `START-WINDOWS.bat` au `npm install` kisha `npm run setup` na `npm start`, halafu fungua `http://localhost:3000/`. Login sasa ina health-check na itaeleza ikiwa server haijawashwa.


## V18 signup/network fix
- Signup checks `/api/health` before registration.
- Network failures now show a clear server-running message instead of only `Failed to fetch`.
- Login/signup/admin-login pages are network-only and are not cached by the PWA service worker, preventing stale cached auth pages when the Node server is stopped.


## Create a member account anytime
If `.env` already exists, run `npm run create-user` (or double-click `CREATE-USER-WINDOWS.bat`). This does not overwrite `.env`.


## V20 Final Fix — Email iliyotumika
Ikiwa email tayari ipo kwenye database lakini login inakataa, **usifute database na usibadilishe email**.
Windows: double-click `REPAIR-USER-WINDOWS.bat`. Itakurekebishia account iliyopo, itaweka password mpya, na kuhifadhi wallet/transaction history.

Flow ya mwisho: `REPAIR-USER-WINDOWS.bat` → `npm start` → `http://localhost:3000/login.html` → User Dashboard.
