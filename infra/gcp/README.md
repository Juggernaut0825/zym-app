# GCP Production Runtime

This is the low-cost GCP migration target for ZYM production.

## Shape

- One GCE VM runs Docker Compose.
- Caddy terminates HTTPS and routes:
  - `app.zym8.com` -> `web:3000`
  - `api.zym8.com` -> `api:3001`
  - `ws.zym8.com` -> `ws:8080`
  - `zym8.com` / `www.zym8.com` -> `admin-site` static files
- Postgres, Redis, Chroma, API, WS, worker, scheduler, and web run as containers.
- Media is stored in GCS buckets through `MEDIA_STORAGE_PROVIDER=gcs`.
- Current production VM static IP: `34.60.71.41`.

## Manual Deploy

The real `.env.gcp.prod` is intentionally not committed.

```bash
docker compose --env-file .env.gcp.prod -f infra/gcp/docker-compose.prod.yml build
docker compose --env-file .env.gcp.prod -f infra/gcp/docker-compose.prod.yml up -d
```

During pre-cutover validation, keep `caddy` and `scheduler` stopped:

```bash
docker compose --env-file .env.gcp.prod -f infra/gcp/docker-compose.prod.yml stop caddy scheduler
```

After DNS points at the VM and smoke checks pass, start them:

```bash
docker compose --env-file .env.gcp.prod -f infra/gcp/docker-compose.prod.yml up -d caddy scheduler
```

## DNS Cutover

Cloudflare should point these records at the VM external IP:

- `A @`
- `A www`
- `A app`
- `A api`
- `A ws`

Keep the records DNS-only during the first Caddy certificate issuance. Cloudflare proxying can be enabled later after origin TLS is healthy.

## AWS Shutdown Order

After GCP smoke checks pass and DNS is fully cut over:

1. Scale ECS services to 0.
2. Stop or delete ElastiCache Redis.
3. Delete NAT Gateway and unattached EIPs.
4. Disable CloudFront distributions and WAF ACLs after static/media traffic is no longer using them.
5. Take final RDS snapshot, disable deletion protection, then delete RDS.
6. Delete or archive S3 buckets only after media copy verification.
