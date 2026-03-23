terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-2"
}

locals {
  project_name = "zym"
  environment  = "prod"
  aws_region   = "us-east-2"
  aws_account  = "529814743482"

  github = {
    repository_full_name = "Juggernaut0825/zym-app"
    oidc_provider_arn    = "arn:aws:iam::529814743482:oidc-provider/token.actions.githubusercontent.com"
    oidc_provider_url    = "https://token.actions.githubusercontent.com"
  }

  vpc_id   = "vpc-0566a1f4790c7561a"
  vpc_name = "zym-prod-vpc"

  public_subnet_ids = [
    "subnet-03ea1a1fcbad51055",
    "subnet-06e4fa8896d222019",
  ]

  private_subnet_ids = [
    "subnet-00fd794f703ac6a7d",
    "subnet-04335b8dac9261cfd",
  ]

  security_group_ids = {
    alb       = "sg-0bf7ae5295f503888"
    web       = "sg-0016d8be47e144d1e"
    api       = "sg-0b9928bc10aa88bcf"
    ws        = "sg-04013f9757e730f01"
    worker    = "sg-05276998d37952a48"
    scheduler = "sg-0a85db4cbf6e32427"
    chroma    = "sg-009494e693b82b717"
    rds       = "sg-0de38e7ac11713ed6"
    redis     = "sg-03794f920ce55bd52"
    efs       = "sg-0939415f959db24e0"
  }

  efs = {
    file_system_id = "fs-060582552ac524669"
    app_data_ap_id = "fsap-0a041070f6a4adba4"
    chroma_ap_id   = "fsap-0f6c6eeee48ef91b4"
  }

  rds = {
    identifier = "zym-prod-postgres"
    endpoint   = "zym-prod-postgres.cdi8s4q0ab6u.us-east-2.rds.amazonaws.com"
  }

  redis = {
    replication_group_id = "zym-prod-redis"
    primary_endpoint     = "master.zym-prod-redis.yfqary.use2.cache.amazonaws.com"
    cache_cluster_id     = "zym-prod-redis-001"
    parameter_group_name = "zym-redis7"
  }

  s3_buckets = {
    private_media = "zym-private-media"
    public_media  = "zym-public-media"
  }

  ecr_repositories = {
    web    = "zym-web"
    server = "zym-server"
  }

  ecs = {
    cluster_name             = "zym-prod"
    cluster_arn              = "arn:aws:ecs:us-east-2:529814743482:cluster/zym-prod"
    namespace_arn            = "arn:aws:servicediscovery:us-east-2:529814743482:namespace/ns-yqotrp2uughvhvfx"
    task_exec_role_name      = "ecsTaskExecutionRole"
    task_exec_role           = "arn:aws:iam::529814743482:role/ecsTaskExecutionRole"
    task_role_name           = "zymEcsTaskRole"
    task_role                = "arn:aws:iam::529814743482:role/zymEcsTaskRole"
    github_actions_role_name = "GitHubActionsZymDeployRole"
    github_actions_role      = "arn:aws:iam::529814743482:role/GitHubActionsZymDeployRole"

    services = {
      web       = "zym-web-service"
      api       = "zym-api-service"
      ws        = "zym-ws-service"
      worker    = "zym-worker-service"
      scheduler = "zym-scheduler-service"
      chroma    = "zym-chroma-service"
    }

    task_families = {
      web       = "zym-web-task"
      api       = "zym-api-task"
      ws        = "zym-ws-task"
      worker    = "zym-worker-task"
      scheduler = "zym-scheduler-task"
      chroma    = "zym-chroma-task"
    }
  }

  alb = {
    name               = "zym-app-alb"
    dns_name           = "zym-app-alb-1098890527.us-east-2.elb.amazonaws.com"
    arn                = "arn:aws:elasticloadbalancing:us-east-2:529814743482:loadbalancer/app/zym-app-alb/ae38cf2ad9a4410a"
    https_listener_arn = "arn:aws:elasticloadbalancing:us-east-2:529814743482:listener/app/zym-app-alb/ae38cf2ad9a4410a/f02dd07849d96325"
    certificate_arn    = "arn:aws:acm:us-east-2:529814743482:certificate/75b80304-cd61-49fd-b0d9-6b3039719fe9"
  }

  target_groups = {
    web = "arn:aws:elasticloadbalancing:us-east-2:529814743482:targetgroup/zym-web-tg/0bd010c4b846a84d"
    api = "arn:aws:elasticloadbalancing:us-east-2:529814743482:targetgroup/zym-api-tg/053048099da22134"
    ws  = "arn:aws:elasticloadbalancing:us-east-2:529814743482:targetgroup/zym-ws-tg/6e1e2a5c752c4bbd"
  }

  listener_rules = {
    app = "arn:aws:elasticloadbalancing:us-east-2:529814743482:listener-rule/app/zym-app-alb/ae38cf2ad9a4410a/f02dd07849d96325/954d765a93343145"
    api = "arn:aws:elasticloadbalancing:us-east-2:529814743482:listener-rule/app/zym-app-alb/ae38cf2ad9a4410a/f02dd07849d96325/2402f18298f5c10c"
    ws  = "arn:aws:elasticloadbalancing:us-east-2:529814743482:listener-rule/app/zym-app-alb/ae38cf2ad9a4410a/f02dd07849d96325/dba7e4442967b981"
  }

  secrets = {
    server_secret_name = "zym/prod/server"
    server_secret_arn  = "arn:aws:secretsmanager:us-east-2:529814743482:secret:zym/prod/server-6uVGWX"
  }

  monitoring = {
    sns_topic_name = "zym-prod-alerts"
    sns_topic_arn  = "arn:aws:sns:us-east-2:529814743482:zym-prod-alerts"
  }

  cloudwatch_log_groups = {
    web       = "/ecs/zym-web"
    api       = "/ecs/zym-api"
    ws        = "/ecs/zym-ws"
    worker    = "/ecs/zym-worker"
    scheduler = "/ecs/zym-scheduler"
    chroma    = "/ecs/zym-chroma"
  }
}
