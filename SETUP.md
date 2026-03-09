# ZYM Fitness Coaching App - Complete Setup Guide

## Prerequisites

- Node.js 20 or 22 (server enforces `>=20 <23`)
- MySQL 8.0 (or use SQLite for development)
- Xcode 15+ (for iOS)
- OpenRouter API key

## Quick Start

### 1. Server Setup

```bash
cd server
npm install
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY
npm run dev
```

`npm install` in `server` will automatically rebuild `better-sqlite3` for the current Node ABI.
If native build fails on Linux, install: `python3`, `make`, `g++`.

Server runs on:
- WebSocket: `ws://localhost:8080`
- API: `http://localhost:3001`

### 2. Web App Setup

```bash
cd web
npm install
npm run dev
```

Web app runs on `http://localhost:3000`

### 3. iOS App Setup

Open `ios/ZYM.xcworkspace` in Xcode and run on simulator or device.

## Database Setup

### Option 1: MySQL
```bash
mysql -u root -e "CREATE DATABASE zym;"
mysql -u root zym < server/src/database/schema.sql
```

### Option 2: SQLite (Development)
The app will auto-create data files in `server/data/` directory.

## Testing

### Test Server Skills
```bash
cd server
./test.sh
```

### Test API Endpoints
```bash
# Create a post
curl -X POST http://localhost:3001/api/posts \
  -H "Content-Type: application/json" \
  -d '{"userId": 1, "postType": "workout", "content": "Great workout today!"}'

# Get feed
curl http://localhost:3001/api/feed/1
```

### Test WebSocket
Open web app at `http://localhost:3000` and send a message to the coach.

## Features Implemented

✅ Coach Agent with ZJ (gentle) and LC (strict) personas
✅ Real-time chat via WebSocket
✅ Skills system (log_workout, log_meal, get_profile)
✅ Memory service with context management
✅ Profile service with BMR/TDEE calculation
✅ Community service (posts, reactions, comments)
✅ REST API for community features
✅ Web app with Next.js
✅ iOS app with SwiftUI
✅ HealthKit integration (iOS)

## Architecture

```
┌─────────────┐     WebSocket      ┌──────────────┐
│  Web/iOS    │ ←─────────────────→ │ Coach Agent  │
│   Client    │                     │   (ZJ/LC)    │
└─────────────┘                     └──────────────┘
                                           │
                                           ↓
                                    ┌──────────────┐
                                    │ Skill Manager│
                                    └──────────────┘
                                           │
                        ┌──────────────────┼──────────────────┐
                        ↓                  ↓                  ↓
                 ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
                 │  Profile    │   │   Memory    │   │  Community  │
                 │  Service    │   │   Service   │   │   Service   │
                 └─────────────┘   └─────────────┘   └─────────────┘
```

## File Structure

```
zym-app/
├── server/
│   ├── src/
│   │   ├── coach/          # Coach Agent + personas
│   │   ├── services/       # Profile, Memory, Community
│   │   ├── skills/         # Skill manager
│   │   ├── api/            # REST API
│   │   ├── websocket/      # WebSocket server
│   │   └── database/       # Schema
│   ├── scripts/            # Bash skills
│   └── data/               # User data (auto-created)
├── web/
│   └── src/app/            # Next.js pages
├── ios/
│   └── ZYM/
│       ├── Views/          # SwiftUI views
│       └── Services/       # WebSocket, HealthKit
└── shared/
    └── types.ts            # Shared TypeScript types
```

## Next Steps

1. Add your OpenRouter API key to `server/.env`
2. Start the server: `cd server && npm run dev`
3. Start the web app: `cd web && npm run dev`
4. Open iOS app in Xcode
5. Test the coach chat functionality

## Troubleshooting

**MySQL not installed?**
- The app works without MySQL using file-based storage
- User data stored in `server/data/<userId>/`

**WebSocket connection failed?**
- Check server is running on port 8080
- Update WebSocket URL in client code if needed

**iOS build errors?**
- Ensure Xcode 15+ is installed
- Check iOS deployment target is set to 17.0+

## Production Deployment

See `DEPLOYMENT.md` for production setup with PM2, nginx, and SSL.
