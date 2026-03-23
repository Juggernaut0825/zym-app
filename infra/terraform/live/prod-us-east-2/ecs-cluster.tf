resource "aws_ecs_cluster" "main" {
  name = local.ecs.cluster_name

  service_connect_defaults {
    namespace = local.ecs.namespace_arn
  }

  lifecycle {
    prevent_destroy = true
  }
}
