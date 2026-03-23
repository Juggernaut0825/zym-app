#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  ./infra/scripts/prod-stack.sh status
  ./infra/scripts/prod-stack.sh pause [--dry-run] [--skip-db]
  ./infra/scripts/prod-stack.sh resume [--dry-run]

Notes:
  - Targets the live us-east-2 production stack.
  - pause: scales ECS services to 0 and stops the RDS instance unless --skip-db is set.
  - resume: starts RDS, waits for availability, then restores ECS desired counts.
  - Redis, ALB, NAT gateway, EFS, S3, and ACM continue to exist and can still incur charges.
EOF
}

if [ "$#" -lt 1 ]; then
  usage
  exit 1
fi

ACTION="$1"
shift

AWS_REGION="${AWS_REGION:-us-east-2}"
ECS_CLUSTER="${ECS_CLUSTER:-zym-prod}"
DB_INSTANCE_IDENTIFIER="${DB_INSTANCE_IDENTIFIER:-zym-prod-postgres}"
REDIS_REPLICATION_GROUP_ID="${REDIS_REPLICATION_GROUP_ID:-zym-prod-redis}"

SERVICES=(
  "zym-web-service:1"
  "zym-api-service:1"
  "zym-ws-service:1"
  "zym-worker-service:1"
  "zym-scheduler-service:1"
  "zym-chroma-service:1"
)

DRY_RUN="false"
SKIP_DB="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN="true"
      ;;
    --skip-db)
      SKIP_DB="true"
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

run_cmd() {
  if [ "${DRY_RUN}" = "true" ]; then
    printf '[dry-run] '
    printf '%q ' "$@"
    printf '\n'
  else
    "$@"
  fi
}

print_status() {
  echo "== ECS services =="
  aws ecs describe-services \
    --region "${AWS_REGION}" \
    --cluster "${ECS_CLUSTER}" \
    --services "${SERVICES[@]%%:*}" \
    --query 'services[].{service:serviceName,desired:desiredCount,running:runningCount,pending:pendingCount,rollout:deployments[?status==`PRIMARY`]|[0].rolloutState,status:status}' \
    --output table

  echo
  echo "== RDS =="
  aws rds describe-db-instances \
    --region "${AWS_REGION}" \
    --db-instance-identifier "${DB_INSTANCE_IDENTIFIER}" \
    --query 'DBInstances[0].{status:DBInstanceStatus,class:DBInstanceClass,multiAz:MultiAZ,endpoint:Endpoint.Address}' \
    --output table

  echo
  echo "== Redis =="
  aws elasticache describe-replication-groups \
    --region "${AWS_REGION}" \
    --replication-group-id "${REDIS_REPLICATION_GROUP_ID}" \
    --query 'ReplicationGroups[0].{status:Status,nodeType:CacheNodeType,multiAz:MultiAZ,autoFailover:AutomaticFailover,primary:NodeGroups[0].PrimaryEndpoint.Address}' \
    --output table

  cat <<'EOF'

Cost truth:
  - ECS tasks can scale to 0.
  - RDS can be stopped temporarily.
  - Redis, ALB, NAT gateway, EFS, and S3 are not paused by this script.
EOF
}

scale_service() {
  local service_name="$1"
  local desired_count="$2"
  local verb="Set"

  if [ "${DRY_RUN}" = "true" ]; then
    verb="Would set"
  fi

  run_cmd aws ecs update-service \
    --region "${AWS_REGION}" \
    --cluster "${ECS_CLUSTER}" \
    --service "${service_name}" \
    --desired-count "${desired_count}" \
    >/dev/null
  echo "${verb} ${service_name} desired count -> ${desired_count}"
}

pause_stack() {
  echo "Pausing ECS services in ${ECS_CLUSTER} (${AWS_REGION})..."
  for service in "${SERVICES[@]}"; do
    scale_service "${service%%:*}" "0"
  done

  if [ "${DRY_RUN}" = "false" ]; then
    aws ecs wait services-stable \
      --region "${AWS_REGION}" \
      --cluster "${ECS_CLUSTER}" \
      --services "${SERVICES[@]%%:*}"
  fi

  if [ "${SKIP_DB}" = "true" ]; then
    echo "Skipping RDS stop because --skip-db was provided."
    return
  fi

  local db_status
  db_status="$(
    aws rds describe-db-instances \
      --region "${AWS_REGION}" \
      --db-instance-identifier "${DB_INSTANCE_IDENTIFIER}" \
      --query 'DBInstances[0].DBInstanceStatus' \
      --output text
  )"

  case "${db_status}" in
    available)
      run_cmd aws rds stop-db-instance \
        --region "${AWS_REGION}" \
        --db-instance-identifier "${DB_INSTANCE_IDENTIFIER}" \
        >/dev/null
      if [ "${DRY_RUN}" = "true" ]; then
        echo "Would request stop for RDS instance ${DB_INSTANCE_IDENTIFIER}"
      else
        echo "Requested stop for RDS instance ${DB_INSTANCE_IDENTIFIER}"
      fi
      ;;
    stopping|stopped)
      echo "RDS instance ${DB_INSTANCE_IDENTIFIER} is already ${db_status}"
      ;;
    *)
      echo "RDS instance ${DB_INSTANCE_IDENTIFIER} is in state ${db_status}; not stopping automatically." >&2
      ;;
  esac
}

resume_stack() {
  local db_status
  db_status="$(
    aws rds describe-db-instances \
      --region "${AWS_REGION}" \
      --db-instance-identifier "${DB_INSTANCE_IDENTIFIER}" \
      --query 'DBInstances[0].DBInstanceStatus' \
      --output text
  )"

  case "${db_status}" in
    stopped)
      run_cmd aws rds start-db-instance \
        --region "${AWS_REGION}" \
        --db-instance-identifier "${DB_INSTANCE_IDENTIFIER}" \
        >/dev/null
      if [ "${DRY_RUN}" = "true" ]; then
        echo "Would request start for RDS instance ${DB_INSTANCE_IDENTIFIER}"
      else
        echo "Requested start for RDS instance ${DB_INSTANCE_IDENTIFIER}"
      fi
      ;;
    available|starting)
      echo "RDS instance ${DB_INSTANCE_IDENTIFIER} is already ${db_status}"
      ;;
    *)
      echo "RDS instance ${DB_INSTANCE_IDENTIFIER} is in state ${db_status}; continuing carefully." >&2
      ;;
  esac

  if [ "${DRY_RUN}" = "false" ]; then
    aws rds wait db-instance-available \
      --region "${AWS_REGION}" \
      --db-instance-identifier "${DB_INSTANCE_IDENTIFIER}"
  fi

  echo "Restoring ECS desired counts in ${ECS_CLUSTER}..."
  for service in "${SERVICES[@]}"; do
    scale_service "${service%%:*}" "${service##*:}"
  done
}

case "${ACTION}" in
  status)
    print_status
    ;;
  pause)
    pause_stack
    ;;
  resume)
    resume_stack
    ;;
  *)
    usage
    exit 1
    ;;
esac
