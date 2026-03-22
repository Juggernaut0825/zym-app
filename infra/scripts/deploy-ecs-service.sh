#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 6 ]; then
  echo "Usage: $0 <aws-region> <ecs-cluster> <ecs-service> <task-family> <container-name> <image-uri>" >&2
  exit 1
fi

AWS_REGION="$1"
ECS_CLUSTER="$2"
ECS_SERVICE="$3"
TASK_FAMILY="$4"
CONTAINER_NAME="$5"
IMAGE_URI="$6"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

TASK_DEF_JSON="$TMPDIR/task-definition.json"

aws ecs describe-task-definition \
  --region "$AWS_REGION" \
  --task-definition "$TASK_FAMILY" \
  --query 'taskDefinition' \
  | jq --arg CONTAINER_NAME "$CONTAINER_NAME" --arg IMAGE_URI "$IMAGE_URI" '
      del(
        .taskDefinitionArn,
        .revision,
        .status,
        .requiresAttributes,
        .compatibilities,
        .registeredAt,
        .registeredBy,
        .deregisteredAt
      )
      | .containerDefinitions |= map(
          if .name == $CONTAINER_NAME
          then .image = $IMAGE_URI
          else .
          end
        )
    ' > "$TASK_DEF_JSON"

NEW_TASK_DEF_ARN="$(
  aws ecs register-task-definition \
    --region "$AWS_REGION" \
    --cli-input-json "file://$TASK_DEF_JSON" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text
)"

aws ecs update-service \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --task-definition "$NEW_TASK_DEF_ARN" \
  --force-new-deployment \
  >/dev/null

echo "Updated ${ECS_SERVICE} to ${NEW_TASK_DEF_ARN}"
