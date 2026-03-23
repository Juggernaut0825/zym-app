# Terraform Deployment Context

This directory is the deployment memory for `zym-app`.

It exists for two reasons:

- future Codex sessions should be able to understand the production stack without relying on old chat context
- Terraform should be introduced as an import-first control plane, not as a blind re-creation of resources that already exist

## Current status

Production is currently running in AWS `us-east-2` with:

- ECS Fargate services for `web`, `api`, `ws`, `worker`, `scheduler`, and `chroma`
- RDS PostgreSQL
- ElastiCache Redis OSS
- EFS mounted to `/app/data`
- private and public S3 media buckets
- one ALB serving `app.zym8.com`, `api.zym8.com`, and `ws.zym8.com`

The authoritative environment snapshot lives in:

- [`live/prod-us-east-2/context.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/context.tf)
- [`live/prod-us-east-2/README.md`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/README.md)

## GitHub deployment flow

This repo now uses a half-automatic deployment model:

1. push to `main`
2. GitHub Actions builds and pushes `zym-web` and `zym-server` images to ECR
3. a human manually runs the production deploy workflow
4. the deploy workflow updates ECS task definitions from the current AWS task families
5. ECS rolls the services to the new image tag

GitHub Actions builds Linux `arm64` images because the live ECS Fargate task definitions use `ARM64`.

Workflows:

- [`.github/workflows/build-and-push-images.yml`](/Users/zijianwang/zym/zym-app/.github/workflows/build-and-push-images.yml)
- [`.github/workflows/deploy-prod.yml`](/Users/zijianwang/zym/zym-app/.github/workflows/deploy-prod.yml)

Shared deploy helper:

- [`infra/scripts/deploy-ecs-service.sh`](/Users/zijianwang/zym/zym-app/infra/scripts/deploy-ecs-service.sh)
- [`infra/scripts/configure-github-environment.sh`](/Users/zijianwang/zym/zym-app/infra/scripts/configure-github-environment.sh)

## GitHub Actions prerequisites

Before the workflows can run from GitHub, configure:

- a repository variable named `AWS_GITHUB_ACTIONS_ROLE_ARN`
- a GitHub Environment named `production` if you want reviewer approval on the manual deploy workflow

The AWS-side OIDC role has already been created for this repo:

- `arn:aws:iam::529814743482:role/GitHubActionsZymDeployRole`

The remaining GitHub-side setup is:

- add repository variable `AWS_GITHUB_ACTIONS_ROLE_ARN=arn:aws:iam::529814743482:role/GitHubActionsZymDeployRole`
- create a GitHub Environment named `production` and add required reviewers if you want manual approval on deploys

That environment can be configured with:

- `GITHUB_TOKEN=... bash ./infra/scripts/configure-github-environment.sh Juggernaut0825/zym-app production <reviewer-username>`

Recommended permission scope for the GitHub OIDC role:

- `ecr:GetAuthorizationToken`
- ECR push permissions for `zym-web` and `zym-server`
- `ecs:DescribeTaskDefinition`
- `ecs:RegisterTaskDefinition`
- `ecs:UpdateService`
- `ecs:DescribeServices`
- `iam:PassRole` for:
  - `ecsTaskExecutionRole`
  - `zymEcsTaskRole`

## Terraform adoption rule

Do not start with `terraform apply` against this stack.

Do this instead:

1. model one resource group at a time
2. import the existing AWS resource into state
3. confirm `terraform plan` is clean
4. only then allow Terraform to manage updates

Recommended import order:

1. VPC, subnets, route tables, internet gateway, NAT gateway
2. security groups
3. EFS and access points
4. ECR repositories
5. ECS cluster
6. ALB, listeners, listener rules, target groups
7. IAM roles and policies
8. CloudWatch log groups
9. ECS task definitions and services
10. RDS
11. Redis
12. Secrets Manager metadata

## First importable foundation resources

The first production-safe Terraform resources now live in:

- [`live/prod-us-east-2/ecr.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/ecr.tf)
- [`live/prod-us-east-2/ecs-cluster.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/ecs-cluster.tf)
- [`live/prod-us-east-2/alb.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/alb.tf)
- [`live/prod-us-east-2/runtime-iam.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/runtime-iam.tf)
- [`live/prod-us-east-2/cloudwatch-logs.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/cloudwatch-logs.tf)
- [`live/prod-us-east-2/github-actions-oidc.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/github-actions-oidc.tf)
- [`live/prod-us-east-2/imports-foundation.tf`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/imports-foundation.tf)

Those files are meant to be imported before any plan/apply cycle is trusted.

## Important deployment truths

- `Postgres` is the production relational database
- `Redis` is required for queue, realtime, and rate limiting
- `EFS` is still required because AI/session state still uses shared files
- `Chroma` is an internal service and is not part of the GitHub image build workflow
- the current production deploy workflow updates ECS from the live task family definitions already in AWS

If a future session needs to answer "how do we deploy this stack?", start in:

- [`live/prod-us-east-2/README.md`](/Users/zijianwang/zym/zym-app/infra/terraform/live/prod-us-east-2/README.md)
