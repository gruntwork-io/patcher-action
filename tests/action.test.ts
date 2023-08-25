import { pullRequestBody } from '../src/action';
import {describe, expect, test} from '@jest/globals';

describe("pullRequestBody", () => {
  test("parses patcher's output when updating a single file", () => {
    const patcherRawOutput = `successful_updates:
   - file_path: dev/eu-central-1/networking/vpc/terragrunt.hcl
     updated_modules:
       - repo: terraform-aws-service-catalog
         module: networking/vpc
         previous_version: v0.95.0
         updated_version: v0.96.0
         next_breaking_version:
           version: v0.96.0
           release_notes_url: https://github.com/gruntwork-io/terraform-aws-service-catalog/releases/tag/v0.96.0
         patches_applied:
           count: 0
manual_steps_you_must_follow:
   - instructions_file_path: dev/eu-central-1/networking/vpc/README-TO-COMPLETE-UPDATE.md`
    const expectedBody = `:robot: This is an automated pull request opened by [Patcher](https://docs.gruntwork.io/patcher/).

## Description

Updated the \`gruntwork-io/terraform-aws-service-catalog/networking/vpc\` dependency.

### Updated files

- dev/eu-central-1/networking/vpc/terragrunt.hcl
  - Previous version: v0.95.0
  - Updated version: v0.96.0 ([Release notes for v0.96.0](https://github.com/gruntwork-io/terraform-aws-service-catalog/releases/tag/v0.96.0))
  - Patches applied: 0

<details>
  <summary>Raw output from \`patcher update\`</summary>
  \`\`\`yaml
successful_updates:
   - file_path: dev/eu-central-1/networking/vpc/terragrunt.hcl
     updated_modules:
       - repo: terraform-aws-service-catalog
         module: networking/vpc
         previous_version: v0.95.0
         updated_version: v0.96.0
         next_breaking_version:
           version: v0.96.0
           release_notes_url: https://github.com/gruntwork-io/terraform-aws-service-catalog/releases/tag/v0.96.0
         patches_applied:
           count: 0
manual_steps_you_must_follow:
   - instructions_file_path: dev/eu-central-1/networking/vpc/README-TO-COMPLETE-UPDATE.md
  \`\`\`
</details>

## Steps to review

1. Check the proposed changes to the \`terraform\` and/or \`terragrunt\` configuration files.
1. Follow the instructions outlined in the \`README-TO-COMPLETE-UPDATE.md\` file and delete it once the update is complete.
1. Validate the changes in the infrastructure by running \`terraform/terragrunt plan\`.
1. Upon approval, proceed with deploying the infrastructure changes.`;
    const result = pullRequestBody(patcherRawOutput, "gruntwork-io/terraform-aws-service-catalog/networking/vpc");
    expect(result).toBe(expectedBody);
  });
  test("parses patcher's output when updating two files", () => {
    const patcherRawOutput = `successful_updates:
  - file_path: dev/us-east-1/dev/services/gruntwork-website-preview-environments/pr-554/terragrunt.hcl
    updated_modules:
      - repo: terraform-aws-service-catalog
        module: services/k8s-service
        previous_version: v0.102.7
        updated_version: v0.103.0
        next_breaking_version:
          version: v0.103.0
          release_notes_url: https://github.com/gruntwork-io/terraform-aws-service-catalog/releases/tag/v0.103.0
        patches_applied:
          count: 0
  - file_path: dev/us-east-1/dev/services/gruntwork-website-preview-environments/pr-560/terragrunt.hcl
    updated_modules:
      - repo: terraform-aws-service-catalog
        module: services/k8s-service
        previous_version: v0.102.7
        updated_version: v0.103.0
        next_breaking_version:
          version: v0.103.0
          release_notes_url: https://github.com/gruntwork-io/terraform-aws-service-catalog/releases/tag/v0.103.0
        patches_applied:
          count: 0`;
    const expectedBody = `:robot: This is an automated pull request opened by [Patcher](https://docs.gruntwork.io/patcher/).

## Description

Updated the \`gruntwork-io/terraform-aws-service-catalog/services/k8s-service\` dependency.

### Updated files

- dev/us-east-1/dev/services/gruntwork-website-preview-environments/pr-554/terragrunt.hcl
  - Previous version: v0.102.7
  - Updated version: v0.103.0 ([Release notes for v0.103.0](https://github.com/gruntwork-io/terraform-aws-service-catalog/releases/tag/v0.103.0))
  - Patches applied: 0
- dev/us-east-1/dev/services/gruntwork-website-preview-environments/pr-560/terragrunt.hcl
  - Previous version: v0.102.7
  - Updated version: v0.103.0 ([Release notes for v0.103.0](https://github.com/gruntwork-io/terraform-aws-service-catalog/releases/tag/v0.103.0))
  - Patches applied: 0

<details>
  <summary>Raw output from \`patcher update\`</summary>
  \`\`\`yaml
successful_updates:
  - file_path: dev/us-east-1/dev/services/gruntwork-website-preview-environments/pr-554/terragrunt.hcl
    updated_modules:
      - repo: terraform-aws-service-catalog
        module: services/k8s-service
        previous_version: v0.102.7
        updated_version: v0.103.0
        next_breaking_version:
          version: v0.103.0
          release_notes_url: https://github.com/gruntwork-io/terraform-aws-service-catalog/releases/tag/v0.103.0
        patches_applied:
          count: 0
  - file_path: dev/us-east-1/dev/services/gruntwork-website-preview-environments/pr-560/terragrunt.hcl
    updated_modules:
      - repo: terraform-aws-service-catalog
        module: services/k8s-service
        previous_version: v0.102.7
        updated_version: v0.103.0
        next_breaking_version:
          version: v0.103.0
          release_notes_url: https://github.com/gruntwork-io/terraform-aws-service-catalog/releases/tag/v0.103.0
        patches_applied:
          count: 0
  \`\`\`
</details>

## Steps to review

1. Check the proposed changes to the \`terraform\` and/or \`terragrunt\` configuration files.
1. Validate the changes in the infrastructure by running \`terraform/terragrunt plan\`.
1. Upon approval, proceed with deploying the infrastructure changes.`;
    const result = pullRequestBody(patcherRawOutput, "gruntwork-io/terraform-aws-service-catalog/services/k8s-service");
    expect(result).toBe(expectedBody);
  });
});