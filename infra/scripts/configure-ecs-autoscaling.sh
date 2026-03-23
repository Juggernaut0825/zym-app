#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-2}"
ECS_CLUSTER="${ECS_CLUSTER:-zym-prod}"

SERVICES=(
  "zym-web-service:1:4:60:70"
  "zym-api-service:1:6:60:70"
  "zym-ws-service:1:6:50:70"
  "zym-worker-service:1:4:60:70"
)

for spec in "${SERVICES[@]}"; do
  IFS=":" read -r service_name min_capacity max_capacity cpu_target memory_target <<< "${spec}"
  resource_id="service/${ECS_CLUSTER}/${service_name}"
  policy_prefix="${service_name%-service}"

  aws application-autoscaling register-scalable-target \
    --region "${AWS_REGION}" \
    --service-namespace ecs \
    --resource-id "${resource_id}" \
    --scalable-dimension ecs:service:DesiredCount \
    --min-capacity "${min_capacity}" \
    --max-capacity "${max_capacity}" \
    >/dev/null

  aws application-autoscaling put-scaling-policy \
    --region "${AWS_REGION}" \
    --service-namespace ecs \
    --resource-id "${resource_id}" \
    --scalable-dimension ecs:service:DesiredCount \
    --policy-name "${policy_prefix}-cpu-target" \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration "{
      \"TargetValue\": ${cpu_target},
      \"PredefinedMetricSpecification\": {
        \"PredefinedMetricType\": \"ECSServiceAverageCPUUtilization\"
      },
      \"ScaleOutCooldown\": 120,
      \"ScaleInCooldown\": 300
    }" \
    >/dev/null

  aws application-autoscaling put-scaling-policy \
    --region "${AWS_REGION}" \
    --service-namespace ecs \
    --resource-id "${resource_id}" \
    --scalable-dimension ecs:service:DesiredCount \
    --policy-name "${policy_prefix}-memory-target" \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration "{
      \"TargetValue\": ${memory_target},
      \"PredefinedMetricSpecification\": {
        \"PredefinedMetricType\": \"ECSServiceAverageMemoryUtilization\"
      },
      \"ScaleOutCooldown\": 120,
      \"ScaleInCooldown\": 300
    }" \
    >/dev/null

  echo "Configured autoscaling for ${service_name} (min=${min_capacity}, max=${max_capacity}, cpu=${cpu_target}, memory=${memory_target})"
done
