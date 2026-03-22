# ZYM App

Community-first AI fitness product with:

- Web app (`Next.js`)
- iOS app (`SwiftUI`)
- Backend (`Express + WebSocket + Postgres/Redis runtime`)

## Core Features

- Auth + coach selection (`ZJ` encouraging, `LC` strict)
- Coach chat with async AI replies + typing events
- DM + group chat (`@coach` in groups triggers AI reply)
- Media upload in chat/feed (image/video; HEIC conversion on backend)
- Friends, feed, and reactions
- Health sync + friends leaderboard
- Profile editing

## Tech Stack

- Backend: TypeScript, Express, ws, Postgres runtime adapter, Redis/BullMQ
- AI: OpenRouter (`google/gemini-3-flash-preview` by default)
- Web: Next.js 14, React 18
- iOS: SwiftUI, HealthKit

## Quick Start

### 1) Install deps and env

```bash
cd server && npm install
cd ../web && npm install
cd ..

cp server/.env.example server/.env
# set OPENROUTER_API_KEY in server/.env (minimum required)
```

### 2) Start backend

```bash
cd server
npm run dev
```

### 3) Start web

```bash
cd web
npm run dev
```

Backend default: `http://localhost:3001`  
Web default: `http://localhost:3000`  
WebSocket default: `ws://localhost:8080`

### 4) iOS

```bash
open ios/ZYM.xcodeproj
```

Run scheme `ZYM` on simulator.

## Regression Test

Run core build checks:

```bash
cd server && npm run build
cd web && npm run build
cd ios && xcodebuild -project ZYM.xcodeproj -scheme ZYM -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO build
```

For API/manual regression, keep `server` and `web` dev servers running and test from web/iOS clients.

## Optional web env

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

For deployable examples, see:

- `web/.env.development.example`
- `web/.env.production.example`
- `server/.env.production.api.example`
- `server/.env.production.ws.example`
- `server/.env.production.worker.example`
- `server/.env.production.scheduler.example`

## Runtime Notes

- Backend Node requirement: `>=20 <23` (Node 20/22 are supported).
- `server` now runs `postinstall` and automatically rebuilds `better-sqlite3` for the current Node ABI.
- On Linux servers, if native rebuild fails, install build tools first (`python3`, `make`, `g++`).
- Set a strong `JWT_SECRET` in production. If omitted, server uses an ephemeral runtime secret.
- Serve backend behind TLS reverse proxy and update WebSocket URL to `wss://`.
- Shared coach/session/media file state lives under `APP_DATA_ROOT` and should be mounted to shared storage in multi-instance deploys.
- For a production-like local stack, run `docker compose -f docker-compose.local.yml up --build -d`.
- Architecture details and runtime role split are documented in [`docs/architecture.md`](/Users/zijianwang/zym/zym-app/docs/architecture.md).
- AWS deployment guidance is documented in [`docs/aws-deployment.md`](/Users/zijianwang/zym/zym-app/docs/aws-deployment.md).
