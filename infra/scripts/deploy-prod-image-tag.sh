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
ECS_STABLE_TIMEOUT_SECONDS="${ECS_STABLE_TIMEOUT_SECONDS:-1800}"
ECS_STABLE_POLL_SECONDS="${ECS_STABLE_POLL_SECONDS:-15}"

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

wait_for_services_stable() {
  local -a services=("$@")
  if [ "${#services[@]}" -eq 0 ]; then
    return 0
  fi

  local started_at
  started_at="$(date +%s)"

  while true; do
    local services_json
    services_json="$(
      aws ecs describe-services \
        --region "${AWS_REGION}" \
        --cluster "${ECS_CLUSTER}" \
        --services "${services[@]}" \
        --output json
    )"

    echo "${services_json}" | jq -r '
      .services[]
      | [
          .serviceName,
          ("desired=" + (.desiredCount | tostring)),
          ("running=" + (.runningCount | tostring)),
          ("pending=" + (.pendingCount | tostring)),
          ("deployments=" + ((.deployments | length) | tostring)),
          ("rollout=" + ((.deployments[0].rolloutState // "unknown") | tostring)),
          ("task=" + ((.taskDefinition | split("/")[-1]) | tostring))
        ]
      | @tsv
    ' | while IFS=$'\t' read -r service desired running pending deployments rollout task; do
      echo "[deploy-status] ${service} ${desired} ${running} ${pending} ${deployments} ${rollout} ${task}"
    done

    if echo "${services_json}" | jq -e '
      (.failures | length) == 0
      and ([.services[] | select(.status != "ACTIVE")] | length) == 0
      and ([.services[] | select(.runningCount != .desiredCount or .pendingCount != 0)] | length) == 0
      and ([.services[] | select((.deployments | length) != 1)] | length) == 0
      and ([.services[] | select((.deployments[0].status // "") != "PRIMARY" or (.deployments[0].rolloutState // "") != "COMPLETED")] | length) == 0
    ' >/dev/null; then
      echo "Production services updated to image tag ${IMAGE_TAG}"
      return 0
    fi

    local now
    now="$(date +%s)"
    if [ $((now - started_at)) -ge "${ECS_STABLE_TIMEOUT_SECONDS}" ]; then
      echo "Timed out waiting for ECS services to stabilize after ${ECS_STABLE_TIMEOUT_SECONDS}s" >&2
      echo "${services_json}" | jq -r '
        .services[]
        | "Recent events for \(.serviceName):",
          (.events[0:5][]?.message // "  (no recent events)")
      ' >&2
      return 1
    fi

    sleep "${ECS_STABLE_POLL_SECONDS}"
  done
}

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
  wait_for_services_stable "${services[@]}"
fi
