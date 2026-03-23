resource "aws_lb" "app" {
  name               = local.alb.name
  internal           = false
  load_balancer_type = "application"
  security_groups    = [local.security_group_ids.alb]
  subnets            = local.public_subnet_ids
  ip_address_type    = "ipv4"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_lb_target_group" "web" {
  name             = "zym-web-tg"
  port             = 3000
  protocol         = "HTTP"
  protocol_version = "HTTP1"
  target_type      = "ip"
  vpc_id           = local.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 5
    unhealthy_threshold = 2
    interval            = 30
    timeout             = 5
    matcher             = "200-399"
    path                = "/"
    port                = "traffic-port"
    protocol            = "HTTP"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_lb_target_group" "api" {
  name             = "zym-api-tg"
  port             = 3001
  protocol         = "HTTP"
  protocol_version = "HTTP1"
  target_type      = "ip"
  vpc_id           = local.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 5
    unhealthy_threshold = 2
    interval            = 30
    timeout             = 5
    matcher             = "200-399"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_lb_target_group" "ws" {
  name             = "zym-ws-tg"
  port             = 8080
  protocol         = "HTTP"
  protocol_version = "HTTP1"
  target_type      = "ip"
  vpc_id           = local.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 5
    unhealthy_threshold = 2
    interval            = 30
    timeout             = 5
    matcher             = "200-399"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = local.alb.certificate_arn

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_lb_listener_rule" "app" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }

  condition {
    host_header {
      values = ["app.zym8.com"]
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    host_header {
      values = ["api.zym8.com"]
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_lb_listener_rule" "ws" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 30

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.ws.arn
  }

  condition {
    host_header {
      values = ["ws.zym8.com"]
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}
