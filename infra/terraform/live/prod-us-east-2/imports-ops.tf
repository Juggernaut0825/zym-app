import {
  to = aws_appautoscaling_target.ecs_service["web"]
  id = "ecs/service/zym-prod/zym-web-service/ecs:service:DesiredCount"
}

import {
  to = aws_appautoscaling_target.ecs_service["api"]
  id = "ecs/service/zym-prod/zym-api-service/ecs:service:DesiredCount"
}

import {
  to = aws_appautoscaling_target.ecs_service["ws"]
  id = "ecs/service/zym-prod/zym-ws-service/ecs:service:DesiredCount"
}

import {
  to = aws_appautoscaling_target.ecs_service["worker"]
  id = "ecs/service/zym-prod/zym-worker-service/ecs:service:DesiredCount"
}

import {
  to = aws_appautoscaling_policy.ecs_service_cpu["web"]
  id = "ecs/service/zym-prod/zym-web-service/ecs:service:DesiredCount/zym-web-cpu-target"
}

import {
  to = aws_appautoscaling_policy.ecs_service_memory["web"]
  id = "ecs/service/zym-prod/zym-web-service/ecs:service:DesiredCount/zym-web-memory-target"
}

import {
  to = aws_appautoscaling_policy.ecs_service_cpu["api"]
  id = "ecs/service/zym-prod/zym-api-service/ecs:service:DesiredCount/zym-api-cpu-target"
}

import {
  to = aws_appautoscaling_policy.ecs_service_memory["api"]
  id = "ecs/service/zym-prod/zym-api-service/ecs:service:DesiredCount/zym-api-memory-target"
}

import {
  to = aws_appautoscaling_policy.ecs_service_cpu["ws"]
  id = "ecs/service/zym-prod/zym-ws-service/ecs:service:DesiredCount/zym-ws-cpu-target"
}

import {
  to = aws_appautoscaling_policy.ecs_service_memory["ws"]
  id = "ecs/service/zym-prod/zym-ws-service/ecs:service:DesiredCount/zym-ws-memory-target"
}

import {
  to = aws_appautoscaling_policy.ecs_service_cpu["worker"]
  id = "ecs/service/zym-prod/zym-worker-service/ecs:service:DesiredCount/zym-worker-cpu-target"
}

import {
  to = aws_appautoscaling_policy.ecs_service_memory["worker"]
  id = "ecs/service/zym-prod/zym-worker-service/ecs:service:DesiredCount/zym-worker-memory-target"
}

import {
  to = aws_sns_topic.production_alerts
  id = "arn:aws:sns:us-east-2:529814743482:zym-prod-alerts"
}

import {
  to = aws_sns_topic_policy.production_alerts
  id = "arn:aws:sns:us-east-2:529814743482:zym-prod-alerts"
}

import {
  to = aws_cloudwatch_metric_alarm.alb["alb_5xx"]
  id = "zym-prod-alb-5xx"
}

import {
  to = aws_cloudwatch_metric_alarm.alb["web_unhealthy_hosts"]
  id = "zym-prod-zym-web-tg-unhealthy-hosts"
}

import {
  to = aws_cloudwatch_metric_alarm.alb["api_unhealthy_hosts"]
  id = "zym-prod-zym-api-tg-unhealthy-hosts"
}

import {
  to = aws_cloudwatch_metric_alarm.alb["ws_unhealthy_hosts"]
  id = "zym-prod-zym-ws-tg-unhealthy-hosts"
}

import {
  to = aws_cloudwatch_metric_alarm.ecs_service_cpu["web"]
  id = "zym-prod-zym-web-service-high-cpu"
}

import {
  to = aws_cloudwatch_metric_alarm.ecs_service_memory["web"]
  id = "zym-prod-zym-web-service-high-memory"
}

import {
  to = aws_cloudwatch_metric_alarm.ecs_service_cpu["api"]
  id = "zym-prod-zym-api-service-high-cpu"
}

import {
  to = aws_cloudwatch_metric_alarm.ecs_service_memory["api"]
  id = "zym-prod-zym-api-service-high-memory"
}

import {
  to = aws_cloudwatch_metric_alarm.ecs_service_cpu["ws"]
  id = "zym-prod-zym-ws-service-high-cpu"
}

import {
  to = aws_cloudwatch_metric_alarm.ecs_service_memory["ws"]
  id = "zym-prod-zym-ws-service-high-memory"
}

import {
  to = aws_cloudwatch_metric_alarm.ecs_service_cpu["worker"]
  id = "zym-prod-zym-worker-service-high-cpu"
}

import {
  to = aws_cloudwatch_metric_alarm.ecs_service_memory["worker"]
  id = "zym-prod-zym-worker-service-high-memory"
}

import {
  to = aws_cloudwatch_metric_alarm.ecs_service_cpu["scheduler"]
  id = "zym-prod-zym-scheduler-service-high-cpu"
}

import {
  to = aws_cloudwatch_metric_alarm.ecs_service_memory["scheduler"]
  id = "zym-prod-zym-scheduler-service-high-memory"
}

import {
  to = aws_cloudwatch_metric_alarm.ecs_service_cpu["chroma"]
  id = "zym-prod-zym-chroma-service-high-cpu"
}

import {
  to = aws_cloudwatch_metric_alarm.ecs_service_memory["chroma"]
  id = "zym-prod-zym-chroma-service-high-memory"
}

import {
  to = aws_cloudwatch_metric_alarm.rds["high_cpu"]
  id = "zym-prod-rds-high-cpu"
}

import {
  to = aws_cloudwatch_metric_alarm.rds["high_connections"]
  id = "zym-prod-rds-high-connections"
}

import {
  to = aws_cloudwatch_metric_alarm.rds["low_storage"]
  id = "zym-prod-rds-low-storage"
}

import {
  to = aws_cloudwatch_metric_alarm.redis["high_cpu"]
  id = "zym-prod-redis-high-cpu"
}

import {
  to = aws_cloudwatch_metric_alarm.redis["low_memory"]
  id = "zym-prod-redis-low-memory"
}

import {
  to = aws_cloudwatch_metric_alarm.redis["evictions"]
  id = "zym-prod-redis-evictions"
}
