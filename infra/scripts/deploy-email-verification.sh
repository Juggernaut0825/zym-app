#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="us-east-2"
ECS_CLUSTER="zym-prod"
IMAGE_TAG="${1:-556969a}"

echo "Deploying email verification feature with image tag: $IMAGE_TAG"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
SERVER_IMAGE="${ECR_REGISTRY}/zym-server:${IMAGE_TAG}"
WEB_IMAGE="${ECR_REGISTRY}/zym-web:${IMAGE_TAG}"

echo "Verifying images exist in ECR..."
aws ecr describe-images --region "$AWS_REGION" --repository-name zym-server --image-ids imageTag="$IMAGE_TAG" >/dev/null
aws ecr describe-images --region "$AWS_REGION" --repository-name zym-web --image-ids imageTag="$IMAGE_TAG" >/dev/null

echo "Deploying backend services..."
./infra/scripts/deploy-ecs-service.sh "$AWS_REGION" "$ECS_CLUSTER" "zym-api-service" "zym-api-task" "zym-api" "$SERVER_IMAGE"
./infra/scripts/deploy-ecs-service.sh "$AWS_REGION" "$ECS_CLUSTER" "zym-ws-service" "zym-ws-task" "zym-ws" "$SERVER_IMAGE"
./infra/scripts/deploy-ecs-service.sh "$AWS_REGION" "$ECS_CLUSTER" "zym-worker-service" "zym-worker-task" "zym-worker" "$SERVER_IMAGE"
./infra/scripts/deploy-ecs-service.sh "$AWS_REGION" "$ECS_CLUSTER" "zym-scheduler-service" "zym-scheduler-task" "zym-scheduler" "$SERVER_IMAGE"

echo "Deploying web service..."
./infra/scripts/deploy-ecs-service.sh "$AWS_REGION" "$ECS_CLUSTER" "zym-web-service" "zym-web-task" "zym-web" "$WEB_IMAGE"

echo "Deployment complete! Waiting for services to stabilize..."
aws ecs wait services-stable --region "$AWS_REGION" --cluster "$ECS_CLUSTER" --services zym-api-service zym-web-service

echo "✅ Email verification feature deployed successfully!"
