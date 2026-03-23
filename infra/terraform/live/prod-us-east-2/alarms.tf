locals {
  production_alarm_topic_name = "${local.project_name}-${local.environment}-alarms"

  alb_alarm_definitions = {
    alb_5xx = {
      alarm_name          = "${local.project_name}-${local.environment}-alb-5xx"
      metric_name         = "HTTPCode_ELB_5XX_Count"
      namespace           = "AWS/ApplicationELB"
      statistic           = "Sum"
      period              = 60
      evaluation_periods  = 1
      datapoints_to_alarm = 1
      threshold           = 1
      comparison_operator = "GreaterThanOrEqualToThreshold"
      dimensions = {
        LoadBalancer = aws_lb.app.arn_suffix
      }
      alarm_description = "ALB-originated 5xx errors for app.zym8.com, api.zym8.com, or ws.zym8.com"
    }

    web_unhealthy_hosts = {
      alarm_name          = "${local.project_name}-${local.environment}-web-targets-unhealthy"
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
      alarm_description = "At least one web target is unhealthy"
    }

    api_unhealthy_hosts = {
      alarm_name          = "${local.project_name}-${local.environment}-api-targets-unhealthy"
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
      alarm_description = "At least one api target is unhealthy"
    }

    ws_unhealthy_hosts = {
      alarm_name          = "${local.project_name}-${local.environment}-ws-targets-unhealthy"
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
      alarm_description = "At least one websocket target is unhealthy"
    }
  }

  rds_alarm_definitions = {
    cpu = {
      alarm_name          = "${local.project_name}-${local.environment}-rds-cpu"
      metric_name         = "CPUUtilization"
      namespace           = "AWS/RDS"
      statistic           = "Average"
      period              = 300
      evaluation_periods  = 2
      datapoints_to_alarm = 2
      threshold           = 80
      comparison_operator = "GreaterThanOrEqualToThreshold"
      dimensions = {
        DBInstanceIdentifier = local.rds.identifier
      }
      alarm_description = "PostgreSQL CPU is sustained above 80 percent"
    }

    connections = {
      alarm_name          = "${local.project_name}-${local.environment}-rds-connections"
      metric_name         = "DatabaseConnections"
      namespace           = "AWS/RDS"
      statistic           = "Average"
      period              = 300
      evaluation_periods  = 2
      datapoints_to_alarm = 2
      threshold           = 100
      comparison_operator = "GreaterThanOrEqualToThreshold"
      dimensions = {
        DBInstanceIdentifier = local.rds.identifier
      }
      alarm_description = "PostgreSQL connection count is sustained above the soft threshold"
    }

    free_storage = {
      alarm_name          = "${local.project_name}-${local.environment}-rds-free-storage"
      metric_name         = "FreeStorageSpace"
      namespace           = "AWS/RDS"
      statistic           = "Average"
      period              = 300
      evaluation_periods  = 1
      datapoints_to_alarm = 1
      threshold           = 5368709120
      comparison_operator = "LessThanThreshold"
      dimensions = {
        DBInstanceIdentifier = local.rds.identifier
      }
      alarm_description = "PostgreSQL free storage dropped below 5 GiB"
    }
  }

  redis_alarm_definitions = {
    cpu = {
      alarm_name          = "${local.project_name}-${local.environment}-redis-cpu"
      metric_name         = "CPUUtilization"
      namespace           = "AWS/ElastiCache"
      statistic           = "Average"
      period              = 60
      evaluation_periods  = 2
      datapoints_to_alarm = 2
      threshold           = 80
      comparison_operator = "GreaterThanOrEqualToThreshold"
      dimensions = {
        CacheClusterId = "${local.redis.replication_group_id}-001"
      }
      alarm_description = "Redis host CPU is sustained above 80 percent"
    }

    memory = {
      alarm_name          = "${local.project_name}-${local.environment}-redis-memory"
      metric_name         = "DatabaseMemoryUsageCountedForEvictPercentage"
      namespace           = "AWS/ElastiCache"
      statistic           = "Average"
      period              = 60
      evaluation_periods  = 2
      datapoints_to_alarm = 2
      threshold           = 80
      comparison_operator = "GreaterThanOrEqualToThreshold"
      dimensions = {
        ReplicationGroupId = local.redis.replication_group_id
      }
      alarm_description = "Redis memory usage counted for evict is sustained above 80 percent"
    }

    evictions = {
      alarm_name          = "${local.project_name}-${local.environment}-redis-evictions"
      metric_name         = "Evictions"
      namespace           = "AWS/ElastiCache"
      statistic           = "Sum"
      period              = 60
      evaluation_periods  = 1
      datapoints_to_alarm = 1
      threshold           = 1
      comparison_operator = "GreaterThanOrEqualToThreshold"
      dimensions = {
        CacheClusterId = "${local.redis.replication_group_id}-001"
      }
      alarm_description = "Redis evictions are happening"
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
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudWatchAlarmsPublish"
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action   = "sns:Publish"
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
  datapoints_to_alarm = each.value.datapoints_to_alarm
  threshold           = each.value.threshold
  namespace           = each.value.namespace
  metric_name         = each.value.metric_name
  statistic           = each.value.statistic
  period              = each.value.period
  treat_missing_data  = "notBreaching"
  actions_enabled     = true
  alarm_actions       = [aws_sns_topic.production_alerts.arn]

  dimensions = each.value.dimensions
}

resource "aws_cloudwatch_metric_alarm" "rds" {
  for_each = local.rds_alarm_definitions

  alarm_name          = each.value.alarm_name
  alarm_description   = each.value.alarm_description
  comparison_operator = each.value.comparison_operator
  evaluation_periods  = each.value.evaluation_periods
  datapoints_to_alarm = each.value.datapoints_to_alarm
  threshold           = each.value.threshold
  namespace           = each.value.namespace
  metric_name         = each.value.metric_name
  statistic           = each.value.statistic
  period              = each.value.period
  treat_missing_data  = "notBreaching"
  actions_enabled     = true
  alarm_actions       = [aws_sns_topic.production_alerts.arn]

  dimensions = each.value.dimensions
}

resource "aws_cloudwatch_metric_alarm" "redis" {
  for_each = local.redis_alarm_definitions

  alarm_name          = each.value.alarm_name
  alarm_description   = each.value.alarm_description
  comparison_operator = each.value.comparison_operator
  evaluation_periods  = each.value.evaluation_periods
  datapoints_to_alarm = each.value.datapoints_to_alarm
  threshold           = each.value.threshold
  namespace           = each.value.namespace
  metric_name         = each.value.metric_name
  statistic           = each.value.statistic
  period              = each.value.period
  treat_missing_data  = "notBreaching"
  actions_enabled     = true
  alarm_actions       = [aws_sns_topic.production_alerts.arn]

  dimensions = each.value.dimensions
}
