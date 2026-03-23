#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-2}"
RDS_IDENTIFIER="${RDS_IDENTIFIER:-zym-prod-postgres}"
REDIS_REPLICATION_GROUP_ID="${REDIS_REPLICATION_GROUP_ID:-zym-prod-redis}"

aws rds modify-db-instance \
  --region "${AWS_REGION}" \
  --db-instance-identifier "${RDS_IDENTIFIER}" \
  --deletion-protection \
  --apply-immediately \
  >/dev/null

echo "Enabled RDS deletion protection for ${RDS_IDENTIFIER}"

aws elasticache modify-replication-group \
  --region "${AWS_REGION}" \
  --replication-group-id "${REDIS_REPLICATION_GROUP_ID}" \
  --snapshot-retention-limit 7 \
  --apply-immediately \
  >/dev/null

echo "Set Redis snapshot retention to 7 days for ${REDIS_REPLICATION_GROUP_ID}"
