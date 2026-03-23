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
- ECS service autoscaling and production alarms
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
- [`alb.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/alb.tf)
- [`autoscaling.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/autoscaling.tf)
- [`alarms.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/alarms.tf)
- [`runtime-iam.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/runtime-iam.tf)
- [`cloudwatch-logs.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/cloudwatch-logs.tf)
- [`github-actions-oidc.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/github-actions-oidc.tf)
- [`imports-foundation.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/imports-foundation.tf)
- [`imports-ops.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/imports-ops.tf)

## What is not represented here yet

- VPC, subnets, route tables, and security groups
- EFS, RDS, Redis, ECS task definitions, and ECS services
- Cloudflare DNS resources

Those are still external to this directory and should be added gradually through imports.

## GitHub production approval gate

The deploy workflow already targets the `production` environment. The only remaining GitHub-side protection is to create that environment and add required reviewers.

This cannot be managed from AWS or Terraform. It requires GitHub repository admin access through the GitHub UI or GitHub API.

Recommended settings:

- environment name: `production`
- environment URL: `https://app.zym8.com`
- required reviewers: the maintainer who should approve production rollouts

## Notifications caveat

The SNS topic `zym-prod-alerts` exists and Terraform now models it, but the topic still needs at least one real subscription before alarms become human-visible.

If a future session has a GitHub API token, it can configure this with:

- [`infra/scripts/configure-github-environment.sh`](/Users/zijianwang/zym/zym-app/infra/scripts/configure-github-environment.sh)
