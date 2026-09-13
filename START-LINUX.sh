#!/usr/bin/env bash
set -e
if [ ! -d node_modules ]; then npm install; fi
if [ ! -f .env ]; then npm run setup; fi
npm start
