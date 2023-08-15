# This is the configuration for Terragrunt, a thin wrapper for Terraform: https://terragrunt.gruntwork.io/

terraform {
  source = "git::git@github.com:gruntwork-io/terraform-aws-service-catalog.git//modules/networking/vpc?ref=v0.95.0"
}