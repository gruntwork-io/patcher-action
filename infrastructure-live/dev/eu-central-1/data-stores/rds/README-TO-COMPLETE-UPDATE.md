# data-stores/rds v0.95.0 -> v0.96.0 (2023.08.24 11:00:05)

Updated dependency data-stores/rds in infrastructure-live/dev/eu-central-1/data-stores/rds/terragrunt.hcl to version v0.96.0, which contains breaking changes. You MUST follow the instructions in the release notes to complete this update safely: https://github.com/gruntwork-io/terraform-aws-service-catalog/releases/tag/v0.96.0

Here are the release notes for version v0.96.0:


## Description


- Module dependency updates, to unlock Terraform AWS Provider v4:
  - Update Terraform github.com/gruntwork-io/terraform-aws-eks to v0.53.0
  - Update Terraform github.com/gruntwork-io/terraform-aws-ecs to v0.34.0
- **Unlock AWS provider v4. Require minimum 3.75.1.** This update includes a few tests that make sure upgrading to this module from the last release is easy. However, you may need to bump your AWS provider version. See the migration guide notes below for more.

### Migration Guide

The AWS Provider v4 unlock is a functionally backward compatible update. Modules no longer have the AWS Provider v4 lock. Upgrade tests were run to give reasonable confidence that upgrading to this version of the modules from the last tagged release is backward compatible, requiring no further modifications from you. However, the AWS Provider version must be `3.75.1` or newer, so you may need to run `terraform init` with the `-upgrade` flag, which will allow terraform to pull the latest version of the AWS provider, as in `terraform init -upgrade`.





