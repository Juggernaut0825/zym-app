#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  bash ./infra/scripts/deploy-prod-image-tag.sh <image-tag> [--web-only|--backend-only] [--no-wait]

Examples:
  bash ./infra/scripts/deploy-prod-image-tag.sh 559dbb8
  bash ./infra/scripts/deploy-prod-image-tag.sh 559dbb8 --backend-only

This is useful for:
  - manual production deploys
  - rollback to a previously pushed ECR image tag
EOF
}

if [ "$#" -lt 1 ]; then
  usage
  exit 1
fi

IMAGE_TAG="$1"
shift

AWS_REGION="${AWS_REGION:-us-east-2}"
ECS_CLUSTER="${ECS_CLUSTER:-zym-prod}"
ECR_REGISTRY="${ECR_REGISTRY:-529814743482.dkr.ecr.us-east-2.amazonaws.com}"
DEPLOY_WEB="true"
DEPLOY_BACKEND="true"
WAIT_FOR_STABLE="true"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --web-only)
      DEPLOY_WEB="true"
      DEPLOY_BACKEND="false"
      ;;
    --backend-only)
      DEPLOY_WEB="false"
      DEPLOY_BACKEND="true"
      ;;
    --no-wait)
      WAIT_FOR_STABLE="false"
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

WEB_IMAGE="${ECR_REGISTRY}/zym-web:${IMAGE_TAG}"
SERVER_IMAGE="${ECR_REGISTRY}/zym-server:${IMAGE_TAG}"

if [ "${DEPLOY_WEB}" = "true" ]; then
  aws ecr describe-images \
    --region "${AWS_REGION}" \
    --repository-name zym-web \
    --image-ids imageTag="${IMAGE_TAG}" \
    >/dev/null

  bash ./infra/scripts/deploy-ecs-service.sh \
    "${AWS_REGION}" \
    "${ECS_CLUSTER}" \
    "zym-web-service" \
    "zym-web-task" \
    "zym-web" \
    "${WEB_IMAGE}"
fi

if [ "${DEPLOY_BACKEND}" = "true" ]; then
  aws ecr describe-images \
    --region "${AWS_REGION}" \
    --repository-name zym-server \
    --image-ids imageTag="${IMAGE_TAG}" \
    >/dev/null

  for spec in \
    "zym-api-service:zym-api-task:zym-api" \
    "zym-ws-service:zym-ws-task:zym-ws" \
    "zym-worker-service:zym-worker-task:zym-worker" \
    "zym-scheduler-service:zym-scheduler-task:zym-scheduler"; do
    IFS=":" read -r service_name task_family container_name <<< "${spec}"
    bash ./infra/scripts/deploy-ecs-service.sh \
      "${AWS_REGION}" \
      "${ECS_CLUSTER}" \
      "${service_name}" \
      "${task_family}" \
      "${container_name}" \
      "${SERVER_IMAGE}"
  done
fi

if [ "${WAIT_FOR_STABLE}" = "true" ]; then
  services=()
  if [ "${DEPLOY_WEB}" = "true" ]; then
    services+=("zym-web-service")
  fi
  if [ "${DEPLOY_BACKEND}" = "true" ]; then
    services+=("zym-api-service" "zym-ws-service" "zym-worker-service" "zym-scheduler-service")
  fi
  aws ecs wait services-stable \
    --region "${AWS_REGION}" \
    --cluster "${ECS_CLUSTER}" \
    --services "${services[@]}"
fi

echo "Production services updated to image tag ${IMAGE_TAG}"
