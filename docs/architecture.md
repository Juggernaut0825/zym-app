# ZYM Runtime Architecture

## Product shape

`zym-app` is a social fitness product with three clients:

- `web/`: Next.js app for the main product surface
- `server/`: API, websocket, worker, scheduler, AI coach runtime
- `ios/`: SwiftUI client, currently not the primary deployment target

The product model is "social app first, AI coach inside the network":

- users chat in DMs and groups
- `@coach` or direct coach topics enqueue async AI replies
- realtime events update inboxes, typing indicators, and coach status
- media and coach memory are shared across runtime roles

## Deployment roles

The backend is one codebase with role-based startup:

- `node dist/index.js`: API and/or websocket depending on runtime flags
- `node dist/worker.js`: BullMQ coach worker
- `node dist/scheduler.js`: cleanup/background scheduler

Important flags:

- `ENABLE_API_SERVER`
- `ENABLE_WEBSOCKET_SERVER`
- `ENABLE_BACKGROUND_CLEANUP`
- `COACH_QUEUE_WORKER_ENABLED`

Recommended production split:

- `zym-web`: Next.js web container
- `zym-api`: Express API only
- `zym-ws`: websocket server only
- `zym-worker`: async coach worker only
- `zym-scheduler`: singleton cleanup scheduler
- `zym-chroma`: external/internal Chroma service

## State boundaries

There are three different state classes in the current system.

### 1. Relational state

Relational app state lives in Postgres when `DATABASE_PROVIDER=postgres`:

- users, friendships, groups, memberships
- messages, inbox read state, mentions
- posts, comments, reactions
- sessions, abuse reports, security events
- media asset metadata
- knowledge ingestion audit/request records

Schema source:

- [`server/src/database/schema.sql`](/Users/zijianwang/zym/zym-app/server/src/database/schema.sql)

Runtime adapter:

- [`server/src/database/runtime-db.ts`](/Users/zijianwang/zym/zym-app/server/src/database/runtime-db.ts)

### 2. Shared file state

The AI/session layer still uses a shared filesystem root.

Configured root:

- `APP_DATA_ROOT` or `SHARED_DATA_ROOT`
- default: `server/data` in local runs
- production recommendation: mount EFS to `/app/data`

Contents under the shared root:

- `<userId>/profile.json`
- `<userId>/daily.json`
- `<userId>/context/session.json`
- `<userId>/context/transcript.ndjson`
- `<userId>/media/...`
- `<userId>/analyses/...`
- `uploads/` for local media staging

Key modules:

- [`server/src/config/app-paths.ts`](/Users/zijianwang/zym/zym-app/server/src/config/app-paths.ts)
- [`server/src/context/session-store.ts`](/Users/zijianwang/zym/zym-app/server/src/context/session-store.ts)
- [`server/src/context/media-store.ts`](/Users/zijianwang/zym/zym-app/server/src/context/media-store.ts)
- [`server/src/services/coach-typed-tools-service.ts`](/Users/zijianwang/zym/zym-app/server/src/services/coach-typed-tools-service.ts)

### 3. Distributed coordination state

Redis is the coordination layer for multi-instance runtime behavior:

- realtime fanout bus
- BullMQ coach job queue
- API rate limiting in autoscaled deployments

Key modules:

- [`server/src/realtime/realtime-event-bus.ts`](/Users/zijianwang/zym/zym-app/server/src/realtime/realtime-event-bus.ts)
- [`server/src/jobs/coach-reply-queue.ts`](/Users/zijianwang/zym/zym-app/server/src/jobs/coach-reply-queue.ts)
- [`server/src/security/rate-limiter.ts`](/Users/zijianwang/zym/zym-app/server/src/security/rate-limiter.ts)

## Local production-like stack

Use the local compose stack to run the intended split shape:

```bash
docker compose -f docker-compose.local.yml up --build -d
docker compose -f docker-compose.local.yml ps
```

Services:

- `postgres`
- `redis`
- `chroma`
- `api`
- `ws`
- `worker`
- `scheduler`
- `web`

Public endpoints:

- web: `http://localhost:3000`
- api: `http://localhost:3001/health`
- websocket: `ws://localhost:8080`
- websocket health: `http://localhost:8080/health`
- chroma: `http://localhost:8000`

The compose stack uses a named `app-data` volume mounted at `/app/data` for every backend role that needs shared file state.
