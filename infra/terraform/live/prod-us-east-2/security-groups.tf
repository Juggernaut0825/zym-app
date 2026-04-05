resource "aws_security_group" "worker" {
  name        = "zym-worker-sg"
  description = "Worker service internal access"
  vpc_id      = local.vpc_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_security_group" "scheduler" {
  name        = "zym-scheduler-sg"
  description = "Scheduler service internal access"
  vpc_id      = local.vpc_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_security_group" "redis" {
  name        = "zym-redis-sg"
  description = "Redis access from app services"
  vpc_id      = local.vpc_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_vpc_security_group_egress_rule" "worker_all" {
  security_group_id = aws_security_group.worker.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_vpc_security_group_egress_rule" "scheduler_all" {
  security_group_id = aws_security_group.scheduler.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_vpc_security_group_egress_rule" "redis_all" {
  security_group_id = aws_security_group.redis.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

locals {
  redis_ingress_sources = {
    api       = local.security_group_ids.api
    ws        = local.security_group_ids.ws
    worker    = aws_security_group.worker.id
    scheduler = aws_security_group.scheduler.id
  }
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_service" {
  for_each = local.redis_ingress_sources

  security_group_id            = aws_security_group.redis.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
}
