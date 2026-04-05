locals {
  internal_ecs_services = {
    worker = {
      security_groups                    = [aws_security_group.worker.id]
      task_definition_seed               = "${local.ecs.task_families.worker}:27"
      deployment_maximum_percent         = 200
      deployment_minimum_healthy_percent = 100
      availability_zone_rebalancing      = "ENABLED"
      service_connect_enabled            = true
    }
    scheduler = {
      security_groups                    = [aws_security_group.scheduler.id]
      task_definition_seed               = "${local.ecs.task_families.scheduler}:29"
      deployment_maximum_percent         = 100
      deployment_minimum_healthy_percent = 0
      availability_zone_rebalancing      = "DISABLED"
      service_connect_enabled            = false
    }
  }
}

resource "aws_ecs_service" "internal" {
  for_each = local.internal_ecs_services

  name                               = local.ecs.services[each.key]
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = each.value.task_definition_seed
  desired_count                      = 1
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  scheduling_strategy                = "REPLICA"
  availability_zone_rebalancing      = each.value.availability_zone_rebalancing
  deployment_maximum_percent         = each.value.deployment_maximum_percent
  deployment_minimum_healthy_percent = each.value.deployment_minimum_healthy_percent
  enable_execute_command             = false
  enable_ecs_managed_tags            = false
  health_check_grace_period_seconds  = 0
  propagate_tags                     = "NONE"

  deployment_circuit_breaker {
    enable   = false
    rollback = false
  }

  deployment_controller {
    type = "ECS"
  }

  network_configuration {
    assign_public_ip = false
    security_groups  = each.value.security_groups
    subnets          = local.private_subnet_ids
  }

  dynamic "service_connect_configuration" {
    for_each = each.value.service_connect_enabled ? [1] : []

    content {
      enabled   = true
      namespace = local.ecs.namespace_arn
    }
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      desired_count,
      task_definition,
    ]
  }
}
