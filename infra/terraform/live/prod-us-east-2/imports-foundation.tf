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
