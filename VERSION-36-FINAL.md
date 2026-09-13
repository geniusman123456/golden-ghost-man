# Golden Ghost V36 FINAL

Unified Golden Ghost cross-device PWA with User/Admin flows, membership, community, messaging, notifications, email verification/reset, admin tools, responsive gold/black UI and installable PWA shell.

Deployment hardening:
- Robust public directory discovery.
- Canonical `/` route.
- Render/Railway compatible `PORT` and `0.0.0.0` binding.
- Optional secure auto-generated session secret so a missing environment variable does not crash startup; set `SESSION_SECRET` in cloud for persistent sessions.
- Pre-start layout verification with a clear message.
- Health and runtime diagnostics without revealing secrets.

Database note: the application layer still uses the existing SQLite/sql.js storage model. Use external persistent storage (for example PostgreSQL) before relying on this build for durable production data.
