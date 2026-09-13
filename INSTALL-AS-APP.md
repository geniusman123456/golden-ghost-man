# Install Golden Ghost as an App

Golden Ghost includes a PWA manifest and service worker.

## Local test
Run `npm start`, then open `http://localhost:3000/`.

## Real deployment
Use a real domain with HTTPS. Open the HTTPS site in a supported browser and use its Install App / Add to desktop option.

The app shell can work with cached assets, but user login, wallet, community, messages, transactions, and payment APIs still require the backend/server connection.

This package is a web/PWA platform. A native `.exe` installer is not included because it is a separate desktop-wrapper/distribution product.
