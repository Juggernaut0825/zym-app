import {
  to = aws_ecr_repository.web
  id = "zym-web"
}

import {
  to = aws_ecr_repository.server
  id = "zym-server"
}

import {
  to = aws_ecs_cluster.main
  id = "zym-prod"
}

import {
  to = aws_lb.app
  id = "arn:aws:elasticloadbalancing:us-east-2:529814743482:loadbalancer/app/zym-app-alb/ae38cf2ad9a4410a"
}

import {
  to = aws_lb_target_group.web
  id = "arn:aws:elasticloadbalancing:us-east-2:529814743482:targetgroup/zym-web-tg/0bd010c4b846a84d"
}

import {
  to = aws_lb_target_group.api
  id = "arn:aws:elasticloadbalancing:us-east-2:529814743482:targetgroup/zym-api-tg/053048099da22134"
}

import {
  to = aws_lb_target_group.ws
  id = "arn:aws:elasticloadbalancing:us-east-2:529814743482:targetgroup/zym-ws-tg/6e1e2a5c752c4bbd"
}

import {
  to = aws_lb_listener.https
  id = "arn:aws:elasticloadbalancing:us-east-2:529814743482:listener/app/zym-app-alb/ae38cf2ad9a4410a/f02dd07849d96325"
}

import {
  to = aws_lb_listener_rule.app
  id = "arn:aws:elasticloadbalancing:us-east-2:529814743482:listener-rule/app/zym-app-alb/ae38cf2ad9a4410a/f02dd07849d96325/954d765a93343145"
}

import {
  to = aws_lb_listener_rule.api
  id = "arn:aws:elasticloadbalancing:us-east-2:529814743482:listener-rule/app/zym-app-alb/ae38cf2ad9a4410a/f02dd07849d96325/2402f18298f5c10c"
}

import {
  to = aws_lb_listener_rule.ws
  id = "arn:aws:elasticloadbalancing:us-east-2:529814743482:listener-rule/app/zym-app-alb/ae38cf2ad9a4410a/f02dd07849d96325/dba7e4442967b981"
}

import {
  to = aws_cloudwatch_log_group.ecs_web
  id = "/ecs/zym-web"
}

import {
  to = aws_cloudwatch_log_group.ecs_api
  id = "/ecs/zym-api"
}

import {
  to = aws_cloudwatch_log_group.ecs_ws
  id = "/ecs/zym-ws"
}

import {
  to = aws_cloudwatch_log_group.ecs_worker
  id = "/ecs/zym-worker"
}

import {
  to = aws_cloudwatch_log_group.ecs_scheduler
  id = "/ecs/zym-scheduler"
}

import {
  to = aws_cloudwatch_log_group.ecs_chroma
  id = "/ecs/zym-chroma"
}

import {
  to = aws_iam_openid_connect_provider.github_actions
  id = "arn:aws:iam::529814743482:oidc-provider/token.actions.githubusercontent.com"
}

import {
  to = aws_iam_role.github_actions_deploy
  id = "GitHubActionsZymDeployRole"
}

import {
  to = aws_iam_role_policy.github_actions_deploy
  id = "GitHubActionsZymDeployRole:ZymGitHubActionsDeploy"
}

import {
  to = aws_iam_role.ecs_task_execution
  id = "ecsTaskExecutionRole"
}

import {
  to = aws_iam_role_policy_attachment.ecs_task_execution_amazon_ecs_task_execution_role_policy
  id = "ecsTaskExecutionRole/arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

import {
  to = aws_iam_role_policy.ecs_task_execution_secret_access
  id = "ecsTaskExecutionRole:ZymReadProdServerSecret"
}

import {
  to = aws_iam_role.app_task
  id = "zymEcsTaskRole"
}

import {
  to = aws_iam_role_policy.app_task_efs_access
  id = "zymEcsTaskRole:ZymEfsAccess"
}

import {
  to = aws_iam_role_policy.app_task_media_access
  id = "zymEcsTaskRole:ZymMediaBucketsAccess"
}
