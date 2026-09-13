# Golden Ghost V36 — Render setup

1. Connect the GitHub repository containing this package.
2. Build command: `npm install`
3. Start command: `npm start`
4. Choose a free web service for testing.
5. `SESSION_SECRET` is now optional for startup, but set a private value in Render for stable sessions across restarts.
6. Do not add `PORT` manually unless you have a specific reason; Render supplies it.
7. The repository root must contain `public/index.html` and `package.json`.
8. After deploy, open the generated HTTPS URL.
