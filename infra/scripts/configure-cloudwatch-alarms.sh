#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-2}"
SNS_TOPIC_NAME="${SNS_TOPIC_NAME:-zym-prod-alerts}"
LOAD_BALANCER_DIMENSION="${LOAD_BALANCER_DIMENSION:-app/zym-app-alb/ae38cf2ad9a4410a}"
ECS_CLUSTER="${ECS_CLUSTER:-zym-prod}"
RDS_IDENTIFIER="${RDS_IDENTIFIER:-zym-prod-postgres}"
REDIS_CACHE_CLUSTER_ID="${REDIS_CACHE_CLUSTER_ID:-zym-prod-redis-001}"

SNS_TOPIC_ARN="$(
  aws sns create-topic \
    --region "${AWS_REGION}" \
    --name "${SNS_TOPIC_NAME}" \
    --query 'TopicArn' \
    --output text
)"

put_alarm() {
  aws cloudwatch put-metric-alarm "$@" >/dev/null
}

put_alarm \
  --region "${AWS_REGION}" \
  --alarm-name "zym-prod-alb-5xx" \
  --alarm-description "ALB 5xx responses are elevated in production" \
  --namespace "AWS/ApplicationELB" \
  --metric-name "HTTPCode_ELB_5XX_Count" \
  --statistic Sum \
  --period 60 \
  --evaluation-periods 5 \
  --datapoints-to-alarm 3 \
  --threshold 5 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --dimensions "Name=LoadBalancer,Value=${LOAD_BALANCER_DIMENSION}" \
  --alarm-actions "${SNS_TOPIC_ARN}" \
  --ok-actions "${SNS_TOPIC_ARN}"

for tg in \
  "zym-web-tg:targetgroup/zym-web-tg/0bd010c4b846a84d" \
  "zym-api-tg:targetgroup/zym-api-tg/053048099da22134" \
  "zym-ws-tg:targetgroup/zym-ws-tg/6e1e2a5c752c4bbd"; do
  IFS=":" read -r tg_name tg_dimension <<< "${tg}"
  put_alarm \
    --region "${AWS_REGION}" \
    --alarm-name "zym-prod-${tg_name}-unhealthy-hosts" \
    --alarm-description "Unhealthy hosts detected in ${tg_name}" \
    --namespace "AWS/ApplicationELB" \
    --metric-name "UnHealthyHostCount" \
    --statistic Maximum \
    --period 60 \
    --evaluation-periods 2 \
    --datapoints-to-alarm 2 \
    --threshold 1 \
    --comparison-operator GreaterThanOrEqualToThreshold \
    --treat-missing-data notBreaching \
    --dimensions "Name=LoadBalancer,Value=${LOAD_BALANCER_DIMENSION}" "Name=TargetGroup,Value=${tg_dimension}" \
    --alarm-actions "${SNS_TOPIC_ARN}" \
    --ok-actions "${SNS_TOPIC_ARN}"
done

for service_name in \
  "zym-web-service" \
  "zym-api-service" \
  "zym-ws-service" \
  "zym-worker-service" \
  "zym-scheduler-service" \
  "zym-chroma-service"; do
  put_alarm \
    --region "${AWS_REGION}" \
    --alarm-name "zym-prod-${service_name}-high-cpu" \
    --alarm-description "ECS service ${service_name} CPU is sustained above 80%" \
    --namespace "AWS/ECS" \
    --metric-name "CPUUtilization" \
    --statistic Average \
    --period 300 \
    --evaluation-periods 3 \
    --datapoints-to-alarm 2 \
    --threshold 80 \
    --comparison-operator GreaterThanOrEqualToThreshold \
    --treat-missing-data notBreaching \
    --dimensions "Name=ClusterName,Value=${ECS_CLUSTER}" "Name=ServiceName,Value=${service_name}" \
    --alarm-actions "${SNS_TOPIC_ARN}" \
    --ok-actions "${SNS_TOPIC_ARN}"

  put_alarm \
    --region "${AWS_REGION}" \
    --alarm-name "zym-prod-${service_name}-high-memory" \
    --alarm-description "ECS service ${service_name} memory is sustained above 80%" \
    --namespace "AWS/ECS" \
    --metric-name "MemoryUtilization" \
    --statistic Average \
    --period 300 \
    --evaluation-periods 3 \
    --datapoints-to-alarm 2 \
    --threshold 80 \
    --comparison-operator GreaterThanOrEqualToThreshold \
    --treat-missing-data notBreaching \
    --dimensions "Name=ClusterName,Value=${ECS_CLUSTER}" "Name=ServiceName,Value=${service_name}" \
    --alarm-actions "${SNS_TOPIC_ARN}" \
    --ok-actions "${SNS_TOPIC_ARN}"
done

put_alarm \
  --region "${AWS_REGION}" \
  --alarm-name "zym-prod-rds-high-cpu" \
  --alarm-description "RDS CPU is sustained above 80%" \
  --namespace "AWS/RDS" \
  --metric-name "CPUUtilization" \
  --statistic Average \
  --period 300 \
  --evaluation-periods 3 \
  --datapoints-to-alarm 2 \
  --threshold 80 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --dimensions "Name=DBInstanceIdentifier,Value=${RDS_IDENTIFIER}" \
  --alarm-actions "${SNS_TOPIC_ARN}" \
  --ok-actions "${SNS_TOPIC_ARN}"

put_alarm \
  --region "${AWS_REGION}" \
  --alarm-name "zym-prod-rds-high-connections" \
  --alarm-description "RDS connections are sustained above the early-warning threshold" \
  --namespace "AWS/RDS" \
  --metric-name "DatabaseConnections" \
  --statistic Average \
  --period 300 \
  --evaluation-periods 3 \
  --datapoints-to-alarm 2 \
  --threshold 45 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --dimensions "Name=DBInstanceIdentifier,Value=${RDS_IDENTIFIER}" \
  --alarm-actions "${SNS_TOPIC_ARN}" \
  --ok-actions "${SNS_TOPIC_ARN}"

put_alarm \
  --region "${AWS_REGION}" \
  --alarm-name "zym-prod-rds-low-storage" \
  --alarm-description "RDS free storage is below 5 GiB" \
  --namespace "AWS/RDS" \
  --metric-name "FreeStorageSpace" \
  --statistic Minimum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 5368709120 \
  --comparison-operator LessThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --dimensions "Name=DBInstanceIdentifier,Value=${RDS_IDENTIFIER}" \
  --alarm-actions "${SNS_TOPIC_ARN}" \
  --ok-actions "${SNS_TOPIC_ARN}"

put_alarm \
  --region "${AWS_REGION}" \
  --alarm-name "zym-prod-redis-high-cpu" \
  --alarm-description "Redis CPU is sustained above 80%" \
  --namespace "AWS/ElastiCache" \
  --metric-name "CPUUtilization" \
  --statistic Average \
  --period 300 \
  --evaluation-periods 3 \
  --datapoints-to-alarm 2 \
  --threshold 80 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --dimensions "Name=CacheClusterId,Value=${REDIS_CACHE_CLUSTER_ID}" \
  --alarm-actions "${SNS_TOPIC_ARN}" \
  --ok-actions "${SNS_TOPIC_ARN}"

put_alarm \
  --region "${AWS_REGION}" \
  --alarm-name "zym-prod-redis-low-memory" \
  --alarm-description "Redis freeable memory is below 200 MiB" \
  --namespace "AWS/ElastiCache" \
  --metric-name "FreeableMemory" \
  --statistic Minimum \
  --period 300 \
  --evaluation-periods 3 \
  --datapoints-to-alarm 2 \
  --threshold 209715200 \
  --comparison-operator LessThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --dimensions "Name=CacheClusterId,Value=${REDIS_CACHE_CLUSTER_ID}" \
  --alarm-actions "${SNS_TOPIC_ARN}" \
  --ok-actions "${SNS_TOPIC_ARN}"

put_alarm \
  --region "${AWS_REGION}" \
  --alarm-name "zym-prod-redis-evictions" \
  --alarm-description "Redis evictions are non-zero" \
  --namespace "AWS/ElastiCache" \
  --metric-name "Evictions" \
  --statistic Sum \
  --period 60 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --dimensions "Name=CacheClusterId,Value=${REDIS_CACHE_CLUSTER_ID}" \
  --alarm-actions "${SNS_TOPIC_ARN}" \
  --ok-actions "${SNS_TOPIC_ARN}"

echo "Configured CloudWatch alarms and SNS topic ${SNS_TOPIC_ARN}"
