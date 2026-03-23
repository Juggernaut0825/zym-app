resource "aws_ecr_repository" "web" {
  name                 = local.ecr_repositories.web
  image_tag_mutability = "MUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = false
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecr_repository" "server" {
  name                 = local.ecr_repositories.server
  image_tag_mutability = "MUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = false
  }

  lifecycle {
    prevent_destroy = true
  }
}
