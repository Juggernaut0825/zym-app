# Production Ops

This is the short operational guide for the live `us-east-2` stack.

## Current truth

- Production is running on ECS Fargate behind one ALB.
- ECS service autoscaling is **not configured yet**.
- Every service is currently a fixed desired count.

That means the stack is healthy, but it is **not yet automatically scaling out** when CPU or memory spikes.

## What autoscaling should do

For this stack, the most useful first autoscaling layer is:

- ECS service autoscaling for `web`, `api`, `ws`, and `worker`
- ALB already distributes traffic across multiple healthy ECS tasks

The normal pattern is:

1. ALB receives traffic.
2. ECS services run behind target groups.
3. Application Auto Scaling watches ECS metrics.
4. When CPU or memory stays above the target, ECS adds more tasks.
5. ALB starts sending traffic to the new healthy tasks.

Recommended first targets:

- `web`: min `1`, max `4`, target tracking on CPU `60%`, memory `70%`
- `api`: min `1`, max `6`, target tracking on CPU `60%`, memory `70%`
- `ws`: min `1`, max `6`, target tracking on CPU `50%`, memory `70%`
- `worker`: min `1`, max `4`, target tracking on CPU `60%`, memory `70%`
- `scheduler`: keep fixed at `1`
- `chroma`: keep fixed at `1` for now

## What still matters before calling this fully production-ready

Priority 1:

- ECS service autoscaling
- CloudWatch alarms for:
  - ALB `5XX`
  - target group unhealthy host count
  - ECS CPU/memory
  - RDS CPU, free storage, connections
  - Redis CPU, memory, evictions
- GitHub `production` environment required reviewer gate
- at least one deploy/runbook check that says how to roll back to the previous image tag

Priority 2:

- RDS backups and restore drill
- Redis snapshot/restore policy review
- log retention review
- on-call style dashboard for health, queue depth, and error rate
- S3 lifecycle policies for uploaded media

Priority 3:

- Terraform import of networking, EFS, RDS, Redis, ECS services, and task definitions
- Cloudflare DNS represented as code somewhere
- optional WAF / bot filtering if public abuse becomes real

## Cost truth

The biggest always-on costs in this shape are usually:

- ALB
- NAT gateway
- RDS
- Redis
- ECS tasks

If ECS tasks scale to zero, you still pay for:

- ALB
- NAT gateway
- Redis
- EFS
- S3
- ACM

If you also stop RDS, you still pay for:

- ALB
- NAT gateway
- Redis
- EFS
- S3
- snapshots / storage

## One-command pause/resume

Use:

```bash
bash ./infra/scripts/prod-stack.sh status
bash ./infra/scripts/prod-stack.sh pause
bash ./infra/scripts/prod-stack.sh resume
```

What `pause` does:

- scales all ECS services to `0`
- stops the RDS instance if it is available

What `pause` does **not** do:

- stop Redis
- remove the ALB
- remove the NAT gateway

Useful options:

```bash
bash ./infra/scripts/prod-stack.sh pause --dry-run
bash ./infra/scripts/prod-stack.sh pause --skip-db
bash ./infra/scripts/prod-stack.sh resume --dry-run
```

## Local frontend workflow

If you only want to tweak frontend UI quickly, the fastest loop is:

1. start backend locally
2. run Next.js in dev mode

Commands:

```bash
cp server/.env.example server/.env
cp web/.env.development.example web/.env.local

cd server
npm install
npm run dev
```

In another terminal:

```bash
cd web
npm install
npm run dev
```

Then open:

- web: `http://localhost:3000`
- api: `http://localhost:3001`
- ws: `ws://localhost:8080`

If you want the full production-like local stack instead:

```bash
docker compose -f docker-compose.local.yml up --build -d
```

That is better when you need Postgres + Redis + worker + websocket + chroma behavior together.
