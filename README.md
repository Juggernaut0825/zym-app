# ZYM App

Community-first AI fitness product with:

- Web app (`Next.js`)
- iOS app (`SwiftUI`)
- Backend (`Express + WebSocket + SQLite`)

## Core Features

- Auth + coach selection (`ZJ` encouraging, `LC` strict)
- Coach chat with async AI replies + typing events
- DM + group chat (`@coach` in groups triggers AI reply)
- Media upload in chat/feed (image/video; HEIC conversion on backend)
- Friends, feed, and reactions
- Health sync + friends leaderboard
- Profile editing

## Tech Stack

- Backend: TypeScript, Express, ws, better-sqlite3
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

### 2) Start all services

```bash
./START.sh dev
```

Production-like mode:

```bash
./START.sh prod
```

Stop all local services:

```bash
./STOP.sh
```

### 3) iOS

```bash
open ios/ZYM.xcodeproj
```

Run scheme `ZYM` on simulator.

## Regression Test

Run full MVP regression (build server/web/iOS + real E2E):

```bash
./TEST.sh
```

This script automatically stops services at the end.

## Optional web env

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

## Production Notes

- Backend Node requirement: `>=20 <23` (Node 20/22 are supported).
- `server` now runs `postinstall` and automatically rebuilds `better-sqlite3` for the current Node ABI.
- On Linux servers, if native rebuild fails, install build tools first (`python3`, `make`, `g++`).
- Set a strong `JWT_SECRET` in production. If omitted, server uses an ephemeral runtime secret.
- Serve backend behind TLS reverse proxy and update WebSocket URL to `wss://`.
