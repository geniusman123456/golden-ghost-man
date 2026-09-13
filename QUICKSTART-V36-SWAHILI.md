# Golden Ghost V36 — Quick Start

## Local

- Install Node.js LTS.
- Extract the package.
- Run `npm install`.
- Optional: copy `.env.example` to `.env` and add private values.
- Run `npm start`.
- Open the URL printed by the server (default: http://localhost:10000).

## Render

- Create a Web Service from the GitHub repository.
- Build command: `npm install`
- Start command: `npm start`
- The app binds to `0.0.0.0` and reads Render's `PORT`.
- Add `SESSION_SECRET` privately as a Render environment variable for stable sessions.
- Never commit `.env` or API keys.
- The repository root must contain `public/index.html` and `package.json`.

## PWA

Open the HTTPS app in a supported browser and use the browser's Install/Add to Home Screen action. The service worker and web manifest are included in `public/`.

## Diagnostics

- `/healthz` gives a simple public health response.
- `/api/health` gives version/port/public-index status.
- `/api/runtime-info` gives non-secret runtime configuration status.
