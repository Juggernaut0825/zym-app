# ZYM AWS Deployment Guide

This guide is for the current `zym-app` runtime as of March 22, 2026.

It is written against what is actually running in this repo now:

- Postgres is the intended production relational database.
- Redis is the intended distributed coordination layer.
- backend roles are split into API, websocket, worker, and scheduler.
- AI/session state still uses a shared filesystem root under `APP_DATA_ROOT`.
- the recommended AWS shape is ECS on Fargate with RDS, ElastiCache, EFS, S3, and an internal Chroma service.

## What was verified locally

On March 22, 2026, the local production-like stack was verified with:

- `docker compose -f docker-compose.local.yml up --build -d`
- Postgres + Redis + Chroma + API + websocket + worker + scheduler + web
- successful `server` and `web` production builds
- successful API health check
- successful web `200 OK`
- successful websocket auth
- successful end-to-end coach reply using a real `OPENROUTER_API_KEY`

That means this document is not a hypothetical AWS design. It is the cloud translation of the stack already proven locally.

## Architecture

```mermaid
flowchart LR
  U["Users"] --> CF["Cloudflare DNS/TLS"]
  CF --> ALB["ALB : app.zym8.com + api.zym8.com + ws.zym8.com"]

  ALB --> WEB["zym-web ECS service"]
  ALB --> API["zym-api ECS service"]
  ALB --> WS["zym-ws ECS service"]

  API --> RDS["RDS PostgreSQL"]
  API --> REDIS["ElastiCache Redis OSS"]
  API --> EFS["EFS /app/data"]
  API --> S3["S3 media buckets"]
  API --> CHROMA["zym-chroma ECS service"]

  WS --> RDS
  WS --> REDIS
  WS --> EFS
  WS --> S3
  WS --> CHROMA

  WORKER["zym-worker ECS service"] --> RDS
  WORKER --> REDIS
  WORKER --> EFS
  WORKER --> S3
  WORKER --> CHROMA

  SCHED["zym-scheduler ECS service"] --> RDS
  SCHED --> EFS
  SCHED --> S3

  REDIS --> WORKER
```

## Why each AWS service exists

### ECS Fargate

Run each backend role independently so you can scale them independently:

- `zym-web`: Next.js UI
- `zym-api`: HTTP API only
- `zym-ws`: websocket server only
- `zym-worker`: BullMQ coach worker only
- `zym-scheduler`: cleanup and scheduled jobs only
- `zym-chroma`: internal vector store

### RDS PostgreSQL

All relational application state belongs here:

- users
- sessions
- messages
- groups
- posts
- reactions
- media metadata
- moderation and audit records

### ElastiCache Redis OSS

Redis is not optional if you want multi-instance correctness for the current backend shape. It is used for:

- websocket realtime fanout
- BullMQ coach queue
- distributed API rate limiting

### EFS

EFS is still required because the AI/session layer uses shared files under `APP_DATA_ROOT`.

Today that includes artifacts such as:

- session state
- transcripts
- coach memory
- local media staging
- analysis outputs

If you skip EFS, your SQL data may migrate correctly, but coach/session state will not be shared across instances.

### S3

Use S3 for durable media storage:

- private bucket for originals and protected assets
- public bucket only if you intentionally want public media delivery

### Chroma

The app already expects a Chroma service through `CHROMA_URL`. Keep it internal and pin a specific image tag.

## Recommended production shape

Use one AWS Region and keep everything in that Region. If you already have media or user data in `us-east-2`, use `us-east-2` consistently.

For your current setup, the practical region rule should be:

- keep the app stack in `us-east-2`
- keep the existing static marketing site in `us-east-1` if it is already working through S3 + CloudFront
- keep the existing `zym-web-site` bucket in `us-east-1`
- keep the existing `zym-private-media` and `zym-public-media` buckets in `us-east-2`

Your screenshots suggest exactly that split today, and that is okay.

Important certificate rule:

- CloudFront uses ACM certificates from `us-east-1`
- Application Load Balancers and Network Load Balancers use ACM certificates from the same Region as the load balancer

That means your existing `zym8.com` ACM certificate in `us-east-1` can continue serving the static site or CloudFront path, but you must request a separate ACM certificate in `us-east-2` for the ECS app load balancer.

Recommended network shape:

- one VPC
- 2 Availability Zones
- 2 public subnets
- 2 private subnets
- at least 1 NAT gateway

Recommended load balancer shape:

- one ALB for `app.zym8.com`
- one ALB host rule for `api.zym8.com`
- one ALB host rule for `ws.zym8.com`

This repo now exposes `GET /health` on the dedicated websocket runtime port, so `ws.zym8.com` can cleanly sit behind an ALB with HTTP health checks.

## Your current AWS state

Based on your screenshots:

- `zym-private-media` already exists in `us-east-2`
- `zym-public-media` already exists in `us-east-2`
- `zym-web-site` exists in `us-east-1`
- Cloudflare currently points `app.zym8.com` to the EC2 public IP `52.14.73.219`
- `bot.zym8.com` also points to that EC2 instance
- you currently have one EC2 instance in `us-east-2` named `zj-discord-bot`
- that instance security group currently exposes `22`, `80`, `443`, and `3000` to the internet
- your existing ACM certificate shown in the screenshot is in `us-east-1`

What this means for the migration:

- do not delete the `zym-web-site` bucket or the `us-east-1` ACM certificate if they are still serving your marketing site
- do not keep `app.zym8.com` pointing at the old EC2 instance once the ECS ALB is ready
- `bot.zym8.com` can keep pointing at the EC2 instance if that bot remains separate from the new app stack
- request a new ACM certificate in `us-east-2` for `app.zym8.com`, `api.zym8.com`, and `ws.zym8.com`
- after cutover, you should remove the wide-open `3000` rule from the old EC2 security group unless you still need it

## Environment model

Do not use a single all-in-one production env file for ECS.

Use the role-specific examples in `server/`:

- `server/.env.production.api.example`
- `server/.env.production.ws.example`
- `server/.env.production.worker.example`
- `server/.env.production.scheduler.example`

Common production settings:

- `DATABASE_PROVIDER=postgres`
- `APP_DATA_ROOT=/app/data`
- `PGSSLMODE=require`
- `REALTIME_BUS_PROVIDER=redis`
- `COACH_QUEUE_PROVIDER=bullmq`
- `RATE_LIMIT_PROVIDER=redis`
- `MEDIA_STORAGE_PROVIDER=s3`

## Step 1: Create the VPC

Open the Amazon VPC console and create a VPC using `VPC and more`.

If the phrase "VPC" feels abstract, here is the simple version:

- a VPC is your own private network inside AWS
- every ECS task, database, Redis node, load balancer, and EFS mount lives inside a VPC
- subnets are smaller slices of that network
- public subnets are for internet-facing things like load balancers
- private subnets are for internal things like ECS tasks, databases, Redis, and EFS

In the AWS console:

1. switch Region to `US East (Ohio) us-east-2`
2. search for `VPC`
3. open `VPC`
4. in the left menu, click `Your VPCs`
5. click `Create VPC`
6. choose `VPC and more`

Recommended values:

- name: `zym-prod`
- IPv4 CIDR: `10.0.0.0/16`
- Availability Zones: `2`
- public subnets: `2`
- private subnets: `2`
- NAT gateways: `1` minimum, `2` if you want better AZ resilience

You want:

- ALB in public subnets
- ECS services, RDS, Redis, EFS mount targets, and Chroma in private subnets

## Step 2: Create security groups

Create these security groups inside the new VPC.

If the phrase "security group" is unfamiliar, here is the simple version:

- a security group is the firewall attached to an AWS resource
- it decides which inbound ports are allowed and from where
- for example, you can say "allow port 3001 only from the ALB security group"

In the AWS console:

1. stay in `us-east-2`
2. search for `EC2`
3. open `EC2`
4. in the left sidebar under `Network & Security`, click `Security Groups`
5. click `Create security group`
6. choose your new `zym-prod` VPC
7. repeat for each group below

### `zym-alb-sg`

Inbound:

- `443` from `0.0.0.0/0`

Outbound:

- all

### `zym-api-sg`

Inbound:

- `3001` from `zym-alb-sg`

Outbound:

- all

### `zym-ws-sg`

Inbound:

- `8080` from `zym-alb-sg`

### `zym-worker-sg`

No inbound rules required.

### `zym-scheduler-sg`

No inbound rules required.

### `zym-rds-sg`

Inbound:

- `5432` from `zym-api-sg`
- `5432` from `zym-ws-sg`
- `5432` from `zym-worker-sg`
- `5432` from `zym-scheduler-sg`

### `zym-redis-sg`

Inbound:

- `6379` from `zym-api-sg`
- `6379` from `zym-ws-sg`
- `6379` from `zym-worker-sg`

### `zym-efs-sg`

Inbound:

- `2049` from `zym-api-sg`
- `2049` from `zym-ws-sg`
- `2049` from `zym-worker-sg`
- `2049` from `zym-scheduler-sg`

### `zym-chroma-sg`

Inbound:

- `8000` from `zym-api-sg`
- `8000` from `zym-ws-sg`
- `8000` from `zym-worker-sg`

## Step 3: Create S3 buckets

Create two buckets:

- `zym-private-media`
- `zym-public-media`

Recommended settings:

- enable versioning
- enable default encryption
- keep Block Public Access enabled on the private bucket
- keep Block Public Access enabled on the public bucket too unless you have a specific public-read delivery design

If you need public media later, prefer CloudFront or signed delivery instead of opening the bucket broadly on day one.

## Step 4: Create EFS

Create one file system named `zym-prod-data`.

Settings:

- same VPC as the app
- mount targets in both private subnets
- security group `zym-efs-sg`

Create two access points:

- `/zym-data` for app shared state
- `/zym-chroma` for Chroma persistence

Mount plan:

- API, websocket, worker, scheduler mount `/zym-data` to `/app/data`
- Chroma mounts `/zym-chroma` to its persistence path, usually `/data`

Important note:

Amazon EFS access points are a clean way to isolate application paths. They can enforce a root directory and POSIX identity for mounts. If the root directory path does not already exist, EFS can create it with the ownership and permissions you specify.

## Step 5: Create RDS PostgreSQL

Create one PostgreSQL database instance.

Recommended starting choices:

- engine: PostgreSQL
- deployment: Multi-AZ if this is real production, Single-AZ only for temporary lower-cost staging
- private subnets only
- security group: `zym-rds-sg`
- automated backups: enabled

Suggested identifiers:

- DB instance identifier: `zym-prod-postgres`
- database name: `zym`
- master username: `zym_app`

After the instance becomes available, copy the endpoint and build:

```bash
postgres://zym_app:YOUR_PASSWORD@RDS_ENDPOINT:5432/zym
```

Set:

```bash
PGSSLMODE=require
```

## Step 6: Create ElastiCache Redis OSS

Create a Redis OSS replication group or cluster-mode-disabled shape.

For this app today, the simplest fit is:

- Redis OSS
- cluster mode disabled
- transit encryption enabled
- auth token enabled
- private subnets
- security group `zym-redis-sg`

Build:

```bash
rediss://:AUTH_TOKEN@REDIS_ENDPOINT:6379
```

This URL is what the app expects in `REDIS_URL`.

## Step 7: Create Secrets Manager secret

Create one JSON secret named `zym/prod/server`.

Suggested keys:

- `OPENROUTER_API_KEY`
- `JWT_SECRET`
- `MEDIA_URL_SIGNING_SECRET`
- `DATABASE_URL`
- `REDIS_URL`

Do not store AWS access keys in the app secret for S3. Use an ECS task role instead.

## Step 8: Create IAM roles

You need two different IAM roles in ECS.

### Task execution role

Purpose:

- pull images from ECR
- write logs to CloudWatch Logs
- read secrets from Secrets Manager for task startup

AWS documents this as the ECS task execution role. The managed policy `AmazonECSTaskExecutionRolePolicy` is the starting point. Add `secretsmanager:GetSecretValue` and `kms:Decrypt` if your secret uses a customer managed KMS key.

### Task role

Purpose:

- permissions used by the code running inside your containers

For this app, the task role should include only the AWS APIs your app actually calls. That usually means:

- S3 read and write for the private media bucket
- S3 read and write for the public media bucket if you use one
- optionally CloudWatch or X-Ray if you later instrument the app

Do not attach broad admin permissions to the task role.

## Step 9: Create ACM certificate

Request one public certificate that covers:

- `app.zym8.com`
- `api.zym8.com`
- `ws.zym8.com`

Use DNS validation.

Very important for your account specifically:

- request this new certificate in `us-east-2`
- keep your existing `us-east-1` certificate for the static site or CloudFront path if it is already in use

If your DNS is hosted outside Route 53, ACM gives you CNAME records and you must add them in your DNS provider exactly as shown.

## Step 10: Create ECR repositories and push images

Create repositories:

- `zym-web`
- `zym-server`
- `zym-chroma` if you want a mirrored private Chroma image

Example push flow:

```bash
AWS_REGION=us-east-2
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
IMAGE_TAG=$(git rev-parse --short HEAD)

aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

docker build -t zym-web:$IMAGE_TAG \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.zym8.com \
  --build-arg NEXT_PUBLIC_WS_URL=wss://ws.zym8.com \
  ./web
docker tag zym-web:$IMAGE_TAG "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/zym-web:$IMAGE_TAG"
docker push "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/zym-web:$IMAGE_TAG"

docker build -t zym-server:$IMAGE_TAG ./server
docker tag zym-server:$IMAGE_TAG "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/zym-server:$IMAGE_TAG"
docker push "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/zym-server:$IMAGE_TAG"
```

If you mirror Chroma privately, pin the exact tag you validated locally. The local compose stack currently uses `chromadb/chroma:1.5.5`.

## Step 11: Create the ECS cluster

Create one ECS cluster for Fargate workloads:

- name: `zym-prod`
- turn on Container Insights

You can keep all services in one cluster. That is the simplest and clearest shape for this stage of the product.

## Step 12: Create load balancers and target groups

### ALB

Create one internet-facing Application Load Balancer:

- name: `zym-app-alb`
- public subnets
- security group `zym-alb-sg`
- HTTPS listener on `443`
- ACM certificate attached

Create target groups:

- `zym-web-tg`
  - target type: `ip`
  - protocol: HTTP
  - port: `3000`
  - health check path: `/`
- `zym-api-tg`
  - target type: `ip`
  - protocol: HTTP
  - port: `3001`
  - health check path: `/health`

Create host-based rules:

- `app.zym8.com` -> `zym-web-tg`
- `api.zym8.com` -> `zym-api-tg`

Add one more target group:

- `zym-ws-tg`
  - target type: `ip`
  - protocol: HTTP
  - port: `8080`
  - health check path: `/health`

Add a third host-based rule:

- `ws.zym8.com` -> `zym-ws-tg`

Because the websocket server now exposes `GET /health` on the same port and supports HTTP upgrade on that listener, one ALB is enough for `app`, `api`, and `ws`.

## Step 13: Create task definitions

Use Fargate task definitions for every runtime role.

### Suggested starting task sizes

These are conservative starting points based on the locally verified stack, not long-term final sizing.

- `zym-web-task`: `0.5 vCPU`, `1 GB`
- `zym-api-task`: `1 vCPU`, `2 GB`
- `zym-ws-task`: `0.5 vCPU`, `1 GB`
- `zym-worker-task`: `1 vCPU`, `2 GB`
- `zym-scheduler-task`: `0.5 vCPU`, `1 GB`
- `zym-chroma-task`: `1 vCPU`, `2 GB`

### `zym-web-task`

- image: `.../zym-web:$IMAGE_TAG`
- container port: `3000`
- log driver: `awslogs`

### `zym-api-task`

- image: `.../zym-server:$IMAGE_TAG`
- container port: `3001`
- mount EFS access point `/zym-data` to `/app/data`
- use `server/.env.production.api.example` as the template
- inject secrets from `zym/prod/server`

Required plain env:

```bash
NODE_ENV=production
API_PORT=3001
WEBSOCKET_PORT=8080
ENABLE_API_SERVER=true
ENABLE_WEBSOCKET_SERVER=false
ENABLE_BACKGROUND_CLEANUP=false
COACH_QUEUE_WORKER_ENABLED=false
DATABASE_PROVIDER=postgres
APP_DATA_ROOT=/app/data
PGSSLMODE=require
REALTIME_BUS_PROVIDER=redis
COACH_QUEUE_PROVIDER=bullmq
RATE_LIMIT_PROVIDER=redis
PUBLIC_BASE_URL=https://api.zym8.com
APP_WEB_BASE_URL=https://app.zym8.com
PUBLIC_MEDIA_BASE_URL=https://media.zym8.com
CORS_ALLOWED_ORIGINS=https://app.zym8.com
MEDIA_STORAGE_PROVIDER=s3
MEDIA_STORAGE_BUCKET=zym-private-media
MEDIA_PUBLIC_BUCKET=zym-public-media
MEDIA_STORAGE_REGION=us-east-2
CHROMA_URL=http://chroma:8000
CHROMA_COLLECTION_NAME=zym-knowledge
KNOWLEDGE_ADMIN_IDS=1
EMAIL_DELIVERY_MODE=smtp
EMAIL_FROM=ZYM <no-reply@zym8.com>
EMAIL_VERIFICATION_TTL_SECONDS=86400
PASSWORD_RESET_TTL_SECONDS=3600
```

Secrets mapping:

- `OPENROUTER_API_KEY`
- `JWT_SECRET`
- `MEDIA_URL_SIGNING_SECRET`
- `DATABASE_URL`
- `REDIS_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`

### `zym-ws-task`

- image: `.../zym-server:$IMAGE_TAG`
- container port: `8080`
- mount EFS access point `/zym-data` to `/app/data`
- use `server/.env.production.ws.example` as the template

Key differences from API:

```bash
ENABLE_API_SERVER=false
ENABLE_WEBSOCKET_SERVER=true
ENABLE_BACKGROUND_CLEANUP=false
COACH_QUEUE_WORKER_ENABLED=false
```

### `zym-worker-task`

- image: `.../zym-server:$IMAGE_TAG`
- no public port
- command override: `node dist/worker.js`
- mount EFS access point `/zym-data` to `/app/data`
- use `server/.env.production.worker.example` as the template

Key flags:

```bash
ENABLE_API_SERVER=false
ENABLE_WEBSOCKET_SERVER=false
ENABLE_BACKGROUND_CLEANUP=false
COACH_QUEUE_WORKER_ENABLED=true
```

Because this task uses the dedicated `worker.js` entrypoint, the role is primarily determined by the command override. Keep the flags aligned for clarity, but the command is the important part.

### `zym-scheduler-task`

- image: `.../zym-server:$IMAGE_TAG`
- no public port
- command override: `node dist/scheduler.js`
- mount EFS access point `/zym-data` to `/app/data`
- use `server/.env.production.scheduler.example` as the template

Key flags:

```bash
ENABLE_API_SERVER=false
ENABLE_WEBSOCKET_SERVER=false
ENABLE_BACKGROUND_CLEANUP=true
COACH_QUEUE_WORKER_ENABLED=false
```

Because this task uses the dedicated `scheduler.js` entrypoint, the cleanup role is primarily determined by the command override. Keep the flags aligned for readability, but do not rely on them as the only scheduler control.

### `zym-chroma-task`

- image: pinned Chroma image
- container port: `8000`
- mount EFS access point `/zym-chroma` to `/data`
- no public load balancer

Use ECS Service Connect with alias `chroma` if you want `CHROMA_URL=http://chroma:8000` to work cleanly across services.

## Step 14: Create ECS services

Create these services inside the cluster.

### `zym-web-service`

- desired count: `2`
- attach ALB target group `zym-web-tg`
- subnets: private
- security group: app-facing service SG

### `zym-api-service`

- desired count: `2`
- attach ALB target group `zym-api-tg`
- subnets: private
- security group: `zym-api-sg`

### `zym-ws-service`

- desired count: `2`
- attach ALB target group `zym-ws-tg`
- subnets: private
- security group: `zym-ws-sg`

### `zym-worker-service`

- desired count: `1`
- no load balancer
- subnets: private
- security group: `zym-worker-sg`

### `zym-scheduler-service`

- desired count: `1`
- no load balancer
- subnets: private
- security group: `zym-scheduler-sg`

### `zym-chroma-service`

- desired count: `1`
- no public load balancer
- subnets: private
- security group: `zym-chroma-sg`
- enable Service Connect alias `chroma`

## Step 15: Configure autoscaling

Start simple. AWS recommends target tracking for ECS service autoscaling and allows multiple target tracking policies as long as each uses a different metric.

Suggested starting bounds:

- web: min `2`, max `4`
- api: min `2`, max `6`
- ws: min `2`, max `6`
- worker: min `1`, max `4`
- scheduler: min `1`, max `1`
- chroma: min `1`, max `2` only if you have validated multi-instance behavior for your chosen Chroma setup

Suggested target tracking:

- CPU target `60`
- memory target `70`

Do not autoscale the scheduler beyond one instance unless you first make its jobs leader-safe.

## Step 16: Migrate relational data

Before cutover, migrate SQLite relational data into RDS.

From the repo:

```bash
cd /Users/zijianwang/zym/zym-app/server
export DATABASE_URL='postgres://USER:PASSWORD@RDS_ENDPOINT:5432/zym'
export PGSSLMODE=require
export SQLITE_PATH='/path/to/current/server/data/zym.db'
./scripts/bootstrap-postgres-from-sqlite.sh
```

This handles the relational cutover path.

## Step 17: Copy shared file state into EFS

This is the part people often miss.

If you want coach memory, session artifacts, transcripts, saved analyses, and existing local file-backed state to survive cutover, copy your current `server/data/` tree into the EFS access point root before ECS goes live.

Target:

- local source: current `server/data/`
- destination: EFS mounted at `/app/data`

If you skip this step:

- SQL users and messages can still exist in RDS
- but AI/session state will start cold

## Step 18: DNS cutover

In your DNS provider:

- `app` CNAME -> ALB DNS name
- `api` CNAME -> ALB DNS name
- `ws` CNAME -> ALB DNS name

If you use Cloudflare:

- start with DNS-only
- verify the stack
- then decide whether to proxy `app` and `api`
- test `ws` separately before enabling proxying there

For your current records, the migration should look like this:

1. leave `zym8.com` and `www` alone if they still point to the marketing site
2. leave `bot.zym8.com` on the old EC2 box if the bot is staying there
3. replace the current `app` A record to `52.14.73.219` with a CNAME to the new ALB
4. add a new `api` CNAME to the same ALB
5. add a new `ws` CNAME to the same ALB

## Step 19: Validate in order

Run validation in this order:

1. `https://app.zym8.com`
2. `https://api.zym8.com/health`
3. register or log in from the web app
4. send a DM
5. verify realtime websocket delivery
6. verify a coach reply is queued and returned
7. verify media upload lands in S3
8. verify migrated users and old message history exist
9. verify one restarted task can still see shared session/media state through EFS

Do not decommission the old SQLite-based host before all of the above are green.

## Step 20: Rollback plan

Have a rollback plan before the first public cutover.

Minimum rollback plan:

1. lower DNS TTL before cutover day
2. keep old host alive
3. snapshot SQLite data and copy `server/data/`
4. keep RDS automated backups enabled
5. if launch fails, point DNS back to the old host and stop ECS services from serving public traffic

## Production-readiness gaps that still exist

This repo is much clearer now, but it is not perfect yet. These are the real remaining gaps:

- shared AI/session state still requires EFS
- Chroma operational policy is not fully complete until you choose the final image/tag and backup plan
- task roles, bucket policies, backup policies, and alarms still need to be created carefully in AWS
- you should add CloudWatch alarms for ALB 5xx, ECS task restarts, RDS CPU/storage, Redis memory/evictions, and queue backlog

What I recommend changing now versus later:

- keep EFS for this deployment rather than trying to remove it now
- pin Chroma to the same tested line you already use locally, then put its EFS path under backup
- use the new websocket `/health` endpoint and simplify to one ALB
- make alarms and least-privilege IAM part of the first deployment, not an afterthought

## Backup and alarms

These are worth doing in the first deployment pass.

### Backup plan

Create an AWS Backup plan that covers:

- RDS PostgreSQL
- EFS file system for `/zym-data`
- EFS file system path used by Chroma

For S3:

- keep bucket versioning enabled
- use lifecycle rules later if cost grows

### CloudWatch alarms

Create at least these alarms:

- ALB `HTTPCode_ELB_5XX_Count` > 0 for 5 minutes
- ALB `HTTPCode_Target_5XX_Count` > 0 for 5 minutes
- ECS service `RunningTaskCount` below desired count
- RDS high CPU
- RDS low free storage
- Redis high memory usage
- Redis evictions > 0
- queue backlog growth if you later expose a BullMQ backlog metric

## Recommended next improvements after first AWS launch

After the first stable AWS launch, the highest-value follow-up work is:

1. move more AI/session state out of EFS and into durable services where appropriate
2. add queue backlog and app-specific health metrics to CloudWatch
3. define CloudWatch dashboards and alarms
4. pin and operationalize the Chroma image and backup plan
5. add a CI deploy pipeline so image build and ECS rollout are repeatable

## Official references

- [Create a VPC](https://docs.aws.amazon.com/vpc/latest/userguide/create-vpc.html)
- [Create security groups](https://docs.aws.amazon.com/vpc/latest/userguide/creating-security-groups.html)
- [Creating and connecting to a PostgreSQL DB instance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_GettingStarted.CreatingConnecting.PostgreSQL.html)
- [Use Amazon EFS volumes with Amazon ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/efs-volumes.html)
- [Creating access points for Amazon EFS](https://docs.aws.amazon.com/efs/latest/ug/create-access-point.html)
- [Pass Secrets Manager secrets through Amazon ECS environment variables](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html)
- [Amazon ECS task execution IAM role](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html)
- [Amazon ECS task IAM role](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html)
- [Creating an Amazon ECS task definition using the console](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/create-task-definition.html)
- [Use load balancing to distribute Amazon ECS service traffic](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-load-balancing.html)
- [Application Load Balancer listeners and WebSocket support](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-listeners.html)
- [Use a target metric to scale Amazon ECS services](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-autoscaling-targettracking.html)
- [Use Service Connect to connect Amazon ECS services with short names](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-connect.html)
- [Pushing a Docker image to an Amazon ECR private repository](https://docs.aws.amazon.com/AmazonECR/latest/userguide/docker-push-ecr-image.html)
- [Services integrated with ACM, including the CloudFront `us-east-1` requirement](https://docs.aws.amazon.com/acm/latest/userguide/acm-services.html)
- [AWS Certificate Manager DNS validation](https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html)
- [Blocking public access to Amazon S3 storage](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)
- [Setting default server-side encryption for S3 buckets](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-encryption.html)
- [Creating a Valkey or Redis OSS replication group from scratch](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Replication.CreatingReplGroup.NoExistingCluster.Classic.html)
