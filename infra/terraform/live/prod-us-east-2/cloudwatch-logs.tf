resource "aws_cloudwatch_log_group" "ecs_web" {
  name              = local.cloudwatch_log_groups.web
  retention_in_days = 14

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_log_group" "ecs_api" {
  name              = local.cloudwatch_log_groups.api
  retention_in_days = 14

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_log_group" "ecs_ws" {
  name              = local.cloudwatch_log_groups.ws
  retention_in_days = 14

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_log_group" "ecs_worker" {
  name              = local.cloudwatch_log_groups.worker
  retention_in_days = 14

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_log_group" "ecs_scheduler" {
  name              = local.cloudwatch_log_groups.scheduler
  retention_in_days = 14

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_log_group" "ecs_chroma" {
  name              = local.cloudwatch_log_groups.chroma
  retention_in_days = 14

  lifecycle {
    prevent_destroy = true
  }
}
