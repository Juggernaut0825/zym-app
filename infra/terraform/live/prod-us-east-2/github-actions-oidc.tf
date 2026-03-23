locals {
  github_actions_subjects = [
    "repo:${local.github.repository_full_name}:ref:refs/heads/main",
    "repo:${local.github.repository_full_name}:environment:production",
  ]

  github_actions_service_arns = [
    for service_name in [
      local.ecs.services.web,
      local.ecs.services.api,
      local.ecs.services.ws,
      local.ecs.services.worker,
      local.ecs.services.scheduler,
    ] : "arn:aws:ecs:${local.aws_region}:${local.aws_account}:service/${local.ecs.cluster_name}/${service_name}"
  ]
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url = local.github.oidc_provider_url

  client_id_list = [
    "sts.amazonaws.com",
  ]

  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
  ]
}

resource "aws_iam_role" "github_actions_deploy" {
  name                 = "GitHubActionsZymDeployRole"
  description          = "GitHub Actions deploy role for ${local.github.repository_full_name}"
  max_session_duration = 3600

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = local.github_actions_subjects
          }
        }
      },
    ]
  })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  name = "ZymGitHubActionsDeploy"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EcrAuth"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
        ]
        Resource = "*"
      },
      {
        Sid    = "EcrPushPull"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeImages",
          "ecr:DescribeRepositories",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
        ]
        Resource = [
          "arn:aws:ecr:${local.aws_region}:${local.aws_account}:repository/${local.ecr_repositories.web}",
          "arn:aws:ecr:${local.aws_region}:${local.aws_account}:repository/${local.ecr_repositories.server}",
        ]
      },
      {
        Sid    = "DescribeTaskDefinitions"
        Effect = "Allow"
        Action = [
          "ecs:DescribeTaskDefinition",
        ]
        Resource = "*"
      },
      {
        Sid    = "RegisterTaskDefinitions"
        Effect = "Allow"
        Action = [
          "ecs:RegisterTaskDefinition",
        ]
        Resource = "*"
      },
      {
        Sid    = "UpdateEcsServices"
        Effect = "Allow"
        Action = [
          "ecs:DescribeServices",
          "ecs:UpdateService",
        ]
        Resource = local.github_actions_service_arns
      },
      {
        Sid    = "PassRuntimeRoles"
        Effect = "Allow"
        Action = [
          "iam:PassRole",
        ]
        Resource = [
          local.ecs.task_exec_role,
          local.ecs.task_role,
        ]
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "ecs-tasks.amazonaws.com"
          }
        }
      },
    ]
  })
}
