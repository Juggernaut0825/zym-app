#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${1:-us-east-2}"
ECS_CLUSTER="${2:-zym-prod}"

echo "Running database migration via ECS task..."

TASK_ARN=$(aws ecs run-task \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --task-definition zym-api-task \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-0a1b2c3d4e5f6g7h8],securityGroups=[sg-0a1b2c3d4e5f6g7h8],assignPublicIp=ENABLED}" \
  --overrides '{
    "containerOverrides": [{
      "name": "zym-api",
      "command": ["node", "-e", "require(\"./dist/database/sqlite-db.js\").initializeDatabase()"]
    }]
  }' \
  --query 'tasks[0].taskArn' \
  --output text)

echo "Migration task started: $TASK_ARN"
echo "Waiting for task to complete..."

aws ecs wait tasks-stopped \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --tasks "$TASK_ARN"

echo "Migration completed"
