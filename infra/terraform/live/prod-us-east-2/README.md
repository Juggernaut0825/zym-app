# ZYM Production Context (`us-east-2`)

This directory is the current production contract for the `zym-app` AWS stack.

It is intentionally explicit so a fresh session can answer three questions quickly:

1. what exists in production
2. what names and IDs does the stack use
3. how do GitHub Actions deploy new code

## Runtime topology

- `zym-web-service` serves `app.zym8.com`
- `zym-api-service` serves `api.zym8.com`
- `zym-ws-service` serves `ws.zym8.com`
- `zym-worker-service` runs the BullMQ coach worker
- `zym-scheduler-service` runs cleanup and scheduled jobs
- `zym-chroma-service` runs the internal Chroma vector store

## Production deploy workflow

Normal release flow:

1. merge or push to `main`
2. `Build And Push Images` workflow pushes:
   - `zym-web:<short-sha>`
   - `zym-server:<short-sha>`
3. run `Deploy Production ECS`
4. choose the same ref or image tag
5. the workflow updates ECS task definitions and forces a fresh deployment

The workflow does not rebuild infrastructure.
It only rolls application services to new images.
The image build step targets Linux `arm64` because the live ECS task definitions run on `ARM64`.

## GitHub OIDC role

GitHub Actions in this repo should assume:

- `arn:aws:iam::529814743482:role/GitHubActionsZymDeployRole`

Expected GitHub repository variable:

- `AWS_GITHUB_ACTIONS_ROLE_ARN`

## Deploy script contract

The GitHub deploy workflow uses:

- [`infra/scripts/deploy-ecs-service.sh`](/Users/zijianwang/zym/zym-app/infra/scripts/deploy-ecs-service.sh)

That script always:

1. reads the current task family from AWS
2. swaps the target container image
3. registers a new task definition revision
4. updates the ECS service to that revision

This keeps the repo deploy logic aligned with the live AWS task definition until Terraform fully takes over ECS runtime management.

## What Terraform should eventually own

Import-first candidates:

- VPC and networking
- security groups
- EFS and access points
- RDS
- Redis parameter groups and replication group
- ECR repositories
- IAM roles
- ECS cluster
- ALB, target groups, listeners, and host rules
- ECS task definitions and services
- CloudWatch log groups

The first concrete import-first resources already live in this directory:

- [`ecr.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/ecr.tf)
- [`ecs-cluster.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/ecs-cluster.tf)
- [`cloudwatch-logs.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/cloudwatch-logs.tf)
- [`github-actions-oidc.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/github-actions-oidc.tf)
- [`imports-foundation.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/imports-foundation.tf)

## What is not represented here yet

- full Terraform resources for the existing stack
- Cloudflare DNS resources

Those are still external to this directory and should be added gradually through imports.
