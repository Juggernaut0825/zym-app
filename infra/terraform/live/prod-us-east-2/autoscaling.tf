locals {
  ecs_autoscaling_services = {
    web = {
      min_capacity  = 1
      max_capacity  = 4
      cpu_target    = 60
      memory_target = 70
    }
    api = {
      min_capacity  = 1
      max_capacity  = 6
      cpu_target    = 60
      memory_target = 70
    }
    ws = {
      min_capacity  = 1
      max_capacity  = 6
      cpu_target    = 50
      memory_target = 70
    }
    worker = {
      min_capacity  = 1
      max_capacity  = 4
      cpu_target    = 60
      memory_target = 70
    }
  }
}

resource "aws_appautoscaling_target" "ecs_service" {
  for_each = local.ecs_autoscaling_services

  max_capacity       = each.value.max_capacity
  min_capacity       = each.value.min_capacity
  resource_id        = "service/${local.ecs.cluster_name}/${local.ecs.services[each.key]}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "ecs_service_cpu" {
  for_each = local.ecs_autoscaling_services

  name               = "zym-${each.key}-cpu-target"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_service[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_service[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_service[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = each.value.cpu_target
    scale_in_cooldown  = 300
    scale_out_cooldown = 120

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_appautoscaling_policy" "ecs_service_memory" {
  for_each = local.ecs_autoscaling_services

  name               = "zym-${each.key}-memory-target"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_service[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_service[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_service[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = each.value.memory_target
    scale_in_cooldown  = 300
    scale_out_cooldown = 120

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
  }
}
