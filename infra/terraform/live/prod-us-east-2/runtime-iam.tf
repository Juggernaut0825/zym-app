locals {
  ecs_task_assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      },
    ]
  })

  efs_file_system_arn = "arn:aws:elasticfilesystem:${local.aws_region}:${local.aws_account}:file-system/${local.efs.file_system_id}"
}

resource "aws_iam_role" "ecs_task_execution" {
  name                 = local.ecs.task_exec_role_name
  description          = "ECS execution role for zym services"
  max_session_duration = 3600
  assume_role_policy   = local.ecs_task_assume_role_policy

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_amazon_ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_task_execution_secret_access" {
  name = "ZymReadProdServerSecret"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadZymProdServerSecret"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
        ]
        Resource = "arn:aws:secretsmanager:${local.aws_region}:${local.aws_account}:secret:${local.secrets.server_secret_name}*"
      },
    ]
  })
}

resource "aws_iam_role" "app_task" {
  name                 = local.ecs.task_role_name
  description          = "App task role for zym ECS services"
  max_session_duration = 3600
  assume_role_policy   = local.ecs_task_assume_role_policy

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_role_policy" "app_task_efs_access" {
  name = "ZymEfsAccess"
  role = aws_iam_role.app_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EfsClientAccess"
        Effect = "Allow"
        Action = [
          "elasticfilesystem:ClientMount",
          "elasticfilesystem:ClientWrite",
          "elasticfilesystem:ClientRootAccess",
        ]
        Resource = local.efs_file_system_arn
      },
      {
        Sid    = "EfsDescribe"
        Effect = "Allow"
        Action = [
          "elasticfilesystem:DescribeMountTargets",
          "elasticfilesystem:DescribeFileSystems",
          "elasticfilesystem:DescribeAccessPoints",
        ]
        Resource = "*"
      },
    ]
  })
}

resource "aws_iam_role_policy" "app_task_media_access" {
  name = "ZymMediaBucketsAccess"
  role = aws_iam_role.app_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "MediaBucketMetadata"
        Effect = "Allow"
        Action = [
          "s3:GetBucketLocation",
          "s3:ListBucket",
        ]
        Resource = [
          "arn:aws:s3:::${local.s3_buckets.private_media}",
          "arn:aws:s3:::${local.s3_buckets.public_media}",
        ]
      },
      {
        Sid    = "MediaObjectReadWrite"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:AbortMultipartUpload",
        ]
        Resource = [
          "arn:aws:s3:::${local.s3_buckets.private_media}/*",
          "arn:aws:s3:::${local.s3_buckets.public_media}/*",
        ]
      },
    ]
  })
}

resource "aws_iam_role_policy" "app_task_service_discovery" {
  name = "ZymServiceDiscoveryRead"
  role = aws_iam_role.app_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DiscoverInternalServices"
        Effect = "Allow"
        Action = [
          "servicediscovery:DiscoverInstances",
        ]
        Resource = "*"
      },
    ]
  })
}
