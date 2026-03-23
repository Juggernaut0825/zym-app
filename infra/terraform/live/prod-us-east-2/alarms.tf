locals {
  production_alarm_topic_name = local.monitoring.sns_topic_name

  ecs_service_alarm_thresholds = {
    web = {
      cpu    = 80
      memory = 80
    }
    api = {
      cpu    = 80
      memory = 80
    }
    ws = {
      cpu    = 80
      memory = 80
    }
    worker = {
      cpu    = 80
      memory = 80
    }
    scheduler = {
      cpu    = 80
      memory = 80
    }
    chroma = {
      cpu    = 80
      memory = 80
    }
  }

  alb_alarm_definitions = {
    alb_5xx = {
      alarm_name          = "zym-prod-alb-5xx"
      metric_name         = "HTTPCode_ELB_5XX_Count"
      namespace           = "AWS/ApplicationELB"
      statistic           = "Sum"
      period              = 60
      evaluation_periods  = 5
      datapoints_to_alarm = 3
      threshold           = 5
      comparison_operator = "GreaterThanOrEqualToThreshold"
      dimensions = {
        LoadBalancer = aws_lb.app.arn_suffix
      }
      alarm_description = "ALB 5xx responses are elevated in production"
    }

    web_unhealthy_hosts = {
      alarm_name          = "zym-prod-zym-web-tg-unhealthy-hosts"
      metric_name         = "UnHealthyHostCount"
      namespace           = "AWS/ApplicationELB"
      statistic           = "Maximum"
      period              = 60
      evaluation_periods  = 2
      datapoints_to_alarm = 2
      threshold           = 1
      comparison_operator = "GreaterThanOrEqualToThreshold"
      dimensions = {
        LoadBalancer = aws_lb.app.arn_suffix
        TargetGroup  = aws_lb_target_group.web.arn_suffix
      }
      alarm_description = "Unhealthy hosts detected in zym-web-tg"
    }

    api_unhealthy_hosts = {
      alarm_name          = "zym-prod-zym-api-tg-unhealthy-hosts"
      metric_name         = "UnHealthyHostCount"
      namespace           = "AWS/ApplicationELB"
      statistic           = "Maximum"
      period              = 60
      evaluation_periods  = 2
      datapoints_to_alarm = 2
      threshold           = 1
      comparison_operator = "GreaterThanOrEqualToThreshold"
      dimensions = {
        LoadBalancer = aws_lb.app.arn_suffix
        TargetGroup  = aws_lb_target_group.api.arn_suffix
      }
      alarm_description = "Unhealthy hosts detected in zym-api-tg"
    }

    ws_unhealthy_hosts = {
      alarm_name          = "zym-prod-zym-ws-tg-unhealthy-hosts"
      metric_name         = "UnHealthyHostCount"
      namespace           = "AWS/ApplicationELB"
      statistic           = "Maximum"
      period              = 60
      evaluation_periods  = 2
      datapoints_to_alarm = 2
      threshold           = 1
      comparison_operator = "GreaterThanOrEqualToThreshold"
      dimensions = {
        LoadBalancer = aws_lb.app.arn_suffix
        TargetGroup  = aws_lb_target_group.ws.arn_suffix
      }
      alarm_description = "Unhealthy hosts detected in zym-ws-tg"
    }
  }

  rds_alarm_definitions = {
    high_cpu = {
      alarm_name          = "zym-prod-rds-high-cpu"
      metric_name         = "CPUUtilization"
      namespace           = "AWS/RDS"
      statistic           = "Average"
      period              = 300
      evaluation_periods  = 3
      datapoints_to_alarm = 2
      threshold           = 80
      comparison_operator = "GreaterThanOrEqualToThreshold"
      dimensions = {
        DBInstanceIdentifier = local.rds.identifier
      }
      alarm_description = "RDS CPU is sustained above 80%"
    }

    high_connections = {
      alarm_name          = "zym-prod-rds-high-connections"
      metric_name         = "DatabaseConnections"
      namespace           = "AWS/RDS"
      statistic           = "Average"
      period              = 300
      evaluation_periods  = 3
      datapoints_to_alarm = 2
      threshold           = 45
      comparison_operator = "GreaterThanOrEqualToThreshold"
      dimensions = {
        DBInstanceIdentifier = local.rds.identifier
      }
      alarm_description = "RDS connections are sustained above the early-warning threshold"
    }

    low_storage = {
      alarm_name          = "zym-prod-rds-low-storage"
      metric_name         = "FreeStorageSpace"
      namespace           = "AWS/RDS"
      statistic           = "Minimum"
      period              = 300
      evaluation_periods  = 1
      threshold           = 5368709120
      comparison_operator = "LessThanOrEqualToThreshold"
      dimensions = {
        DBInstanceIdentifier = local.rds.identifier
      }
      alarm_description = "RDS free storage is below 5 GiB"
    }
  }

  redis_alarm_definitions = {
    high_cpu = {
      alarm_name          = "zym-prod-redis-high-cpu"
      metric_name         = "CPUUtilization"
      namespace           = "AWS/ElastiCache"
      statistic           = "Average"
      period              = 300
      evaluation_periods  = 3
      datapoints_to_alarm = 2
      threshold           = 80
      comparison_operator = "GreaterThanOrEqualToThreshold"
      dimensions = {
        CacheClusterId = local.redis.cache_cluster_id
      }
      alarm_description = "Redis CPU is sustained above 80%"
    }

    low_memory = {
      alarm_name          = "zym-prod-redis-low-memory"
      metric_name         = "FreeableMemory"
      namespace           = "AWS/ElastiCache"
      statistic           = "Minimum"
      period              = 300
      evaluation_periods  = 3
      datapoints_to_alarm = 2
      threshold           = 209715200
      comparison_operator = "LessThanOrEqualToThreshold"
      dimensions = {
        CacheClusterId = local.redis.cache_cluster_id
      }
      alarm_description = "Redis freeable memory is below 200 MiB"
    }

    evictions = {
      alarm_name          = "zym-prod-redis-evictions"
      metric_name         = "Evictions"
      namespace           = "AWS/ElastiCache"
      statistic           = "Sum"
      period              = 60
      evaluation_periods  = 1
      threshold           = 1
      comparison_operator = "GreaterThanOrEqualToThreshold"
      dimensions = {
        CacheClusterId = local.redis.cache_cluster_id
      }
      alarm_description = "Redis evictions are non-zero"
    }
  }
}

resource "aws_sns_topic" "production_alerts" {
  name = local.production_alarm_topic_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_sns_topic_policy" "production_alerts" {
  arn = aws_sns_topic.production_alerts.arn

  policy = jsonencode({
    Version = "2008-10-17"
    Id      = "__default_policy_ID"
    Statement = [
      {
        Sid    = "__default_statement_ID"
        Effect = "Allow"
        Principal = {
          AWS = "*"
        }
        Action = [
          "SNS:GetTopicAttributes",
          "SNS:SetTopicAttributes",
          "SNS:AddPermission",
          "SNS:RemovePermission",
          "SNS:DeleteTopic",
          "SNS:Subscribe",
          "SNS:ListSubscriptionsByTopic",
          "SNS:Publish",
        ]
        Resource = aws_sns_topic.production_alerts.arn
        Condition = {
          StringEquals = {
            "AWS:SourceOwner" = local.aws_account
          }
        }
      },
    ]
  })
}

resource "aws_cloudwatch_metric_alarm" "alb" {
  for_each = local.alb_alarm_definitions

  alarm_name          = each.value.alarm_name
  alarm_description   = each.value.alarm_description
  comparison_operator = each.value.comparison_operator
  evaluation_periods  = each.value.evaluation_periods
  datapoints_to_alarm = lookup(each.value, "datapoints_to_alarm", null)
  threshold           = each.value.threshold
  namespace           = each.value.namespace
  metric_name         = each.value.metric_name
  statistic           = each.value.statistic
  period              = each.value.period
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.production_alerts.arn]
  ok_actions          = [aws_sns_topic.production_alerts.arn]

  dimensions = each.value.dimensions
}

resource "aws_cloudwatch_metric_alarm" "ecs_service_cpu" {
  for_each = local.ecs_service_alarm_thresholds

  alarm_name          = "zym-prod-${local.ecs.services[each.key]}-high-cpu"
  alarm_description   = "ECS service ${local.ecs.services[each.key]} CPU is sustained above ${each.value.cpu}%"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = each.value.cpu
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.production_alerts.arn]
  ok_actions          = [aws_sns_topic.production_alerts.arn]

  dimensions = {
    ClusterName = local.ecs.cluster_name
    ServiceName = local.ecs.services[each.key]
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_service_memory" {
  for_each = local.ecs_service_alarm_thresholds

  alarm_name          = "zym-prod-${local.ecs.services[each.key]}-high-memory"
  alarm_description   = "ECS service ${local.ecs.services[each.key]} memory is sustained above ${each.value.memory}%"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = each.value.memory
  namespace           = "AWS/ECS"
  metric_name         = "MemoryUtilization"
  statistic           = "Average"
  period              = 300
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.production_alerts.arn]
  ok_actions          = [aws_sns_topic.production_alerts.arn]

  dimensions = {
    ClusterName = local.ecs.cluster_name
    ServiceName = local.ecs.services[each.key]
  }
}

resource "aws_cloudwatch_metric_alarm" "rds" {
  for_each = local.rds_alarm_definitions

  alarm_name          = each.value.alarm_name
  alarm_description   = each.value.alarm_description
  comparison_operator = each.value.comparison_operator
  evaluation_periods  = each.value.evaluation_periods
  datapoints_to_alarm = lookup(each.value, "datapoints_to_alarm", null)
  threshold           = each.value.threshold
  namespace           = each.value.namespace
  metric_name         = each.value.metric_name
  statistic           = each.value.statistic
  period              = each.value.period
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.production_alerts.arn]
  ok_actions          = [aws_sns_topic.production_alerts.arn]

  dimensions = each.value.dimensions
}

resource "aws_cloudwatch_metric_alarm" "redis" {
  for_each = local.redis_alarm_definitions

  alarm_name          = each.value.alarm_name
  alarm_description   = each.value.alarm_description
  comparison_operator = each.value.comparison_operator
  evaluation_periods  = each.value.evaluation_periods
  datapoints_to_alarm = lookup(each.value, "datapoints_to_alarm", null)
  threshold           = each.value.threshold
  namespace           = each.value.namespace
  metric_name         = each.value.metric_name
  statistic           = each.value.statistic
  period              = each.value.period
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.production_alerts.arn]
  ok_actions          = [aws_sns_topic.production_alerts.arn]

  dimensions = each.value.dimensions
}
