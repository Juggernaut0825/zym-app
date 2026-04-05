import {
  to = aws_security_group.worker
  id = "sg-05276998d37952a48"
}

import {
  to = aws_security_group.scheduler
  id = "sg-0a85db4cbf6e32427"
}

import {
  to = aws_security_group.redis
  id = "sg-03794f920ce55bd52"
}

import {
  to = aws_vpc_security_group_egress_rule.worker_all
  id = "sgr-0c1fffd8ced38e703"
}

import {
  to = aws_vpc_security_group_egress_rule.scheduler_all
  id = "sgr-00fc5c7ac378ba7b9"
}

import {
  to = aws_vpc_security_group_egress_rule.redis_all
  id = "sgr-0a326a6fcee642380"
}

import {
  to = aws_vpc_security_group_ingress_rule.redis_from_service["api"]
  id = "sgr-01d00755cc25ed388"
}

import {
  to = aws_vpc_security_group_ingress_rule.redis_from_service["ws"]
  id = "sgr-04908dcbc73d88e48"
}

import {
  to = aws_vpc_security_group_ingress_rule.redis_from_service["worker"]
  id = "sgr-087d323eba992c6b8"
}

import {
  to = aws_vpc_security_group_ingress_rule.redis_from_service["scheduler"]
  id = "sgr-049fbfea8132dda5d"
}

import {
  to = aws_ecs_service.internal["worker"]
  id = "zym-prod/zym-worker-service"
}

import {
  to = aws_ecs_service.internal["scheduler"]
  id = "zym-prod/zym-scheduler-service"
}
