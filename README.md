# Patcher Action

Reusable GitHub Actions workflow to discover, update, and PR Terragrunt deps using [Patcher](https://github.com/gruntwork-io/patcher-cli).

## How the workflow runs

The workflow (`.github/workflows/patcher.yml`) has **two jobs**:

1. **Report job**:
   - **Checks out your infrastructure repo** so changes can be made.
   - **Installs Patcher and Terrapatch**.
   - **Runs Patcher to detect outdated dependencies** and generates an upgrade spec (such as `spec.json`) and an upgrade plan.
   - **Uploads the upgrade spec** as an artifact for later viewing/use.
   - **Computes the update matrix** based on `update_by_account` / `update_by_dependency`.
2. **Update job (matrix)**: one job per matrix entry that **runs Patcher to apply updates** using the spec and **automatically opens a Pull Request** with any changes found (if updates are required).

This process is fully automated—just call the workflow, and it will discover, update, and PR Terragrunt dependencies as needed.

## Splitting updates into multiple PRs

By default everything that matched the report goes into **one PR**. Two booleans control how updates are split:

| `update_by_account` | `update_by_dependency` | Result |
|---------------------|------------------------|--------|
| `false` | `false` | One PR with all updates (default, existing behavior). |
| `true`  | `false` | One PR per **account** (top-level directory under `working_dir`, e.g. `dev`, `stage`, `prod`). |
| `false` | `true`  | One PR per **dependency** (e.g. `gruntwork-io/terraform-aws-service-catalog/networking/vpc`). |
| `true`  | `true`  | One PR per **account × dependency** pair that actually has usages. |

Each PR gets a unique branch (`<pull_request_branch>-<account>`, `<pull_request_branch>-<org>-<repo>-<module>`, or both) and the account/dependency is appended to the PR title. Pairs with no usages are skipped, so no empty PRs are created. `include_dirs`/`exclude_dirs` are respected: the matrix is derived from the filtered report.


## Requirements

### Repo layout

The workflow expects to be invoked from (or for) the **repository that contains your Terragrunt/infrastructure code**. It checks out that repo into `infra-live-repo` and runs Patcher there.

## Resiliency

The following secrets are only needed if you are **not** using OIDC, or if your setup requires explicit tokens as a fallback:

| Secret | Purpose |
|--------|--------|
| `PIPELINES_READ_TOKEN` | Download Patcher/Terrapatch, read Gruntwork modules and your repos. Used as a fallback when OIDC is not available. |
| `PR_CREATE_TOKEN` | Push branches and create Pull Requests in your infrastructure repo. Used as a fallback when OIDC is not available. |

## How to use it

Call the reusable workflow from your repo. Minimal example:

```yaml
jobs:
  patcher:
    uses: gruntwork-io/patcher-action/.github/workflows/patcher.yml@v5
    with:
      working_dir: ./
      include_dirs: "{*dev*}/**"   # optional: limit report to dirs matching this glob
    secrets:
      PIPELINES_READ_TOKEN: ${{ secrets.PIPELINES_READ_TOKEN }}
      PR_CREATE_TOKEN: ${{ secrets.PR_CREATE_TOKEN }}
```

## Key inputs

| Input | Default | Description |
|-------|---------|-------------|
| `working_dir` | `"./"` | Directory inside the repo where Patcher runs (relative to repo root). |
| `include_dirs` | `""` | Report only: include dirs matching this double-star glob (e.g. `"{*dev*}/**"`). |
| `exclude_dirs` | `""` | Report only: exclude dirs matching this double-star glob. |
| `update_strategy` | `"next-breaking"` | Patcher update strategy: `next-safe` or `next-breaking`. |
| `spec_file` | `"spec.json"` | Filename for the upgrade spec (relative to repo root). |
| `dependency` | `""` | Optional: limit update to one dependency (e.g. `gruntwork-io/terraform-aws-security/github-actions-iam-role`). |
| `update_by_account` | `false` | Open one PR per account (top-level directory under `working_dir`). |
| `update_by_dependency` | `false` | Open one PR per dependency. Combine with `update_by_account` for one PR per account-dependency pair. |
| `pull_request_branch` | `"patcher-updates"` | Base branch name for PRs. Split modes append `-<account>` and/or `-<org>-<repo>-<module>`. |
| `skip_update` | `false` | If `true`, only run report and upload spec; do not run update or create a PR. |
| `dry_run` | `false` | Simulate operations without making changes. |
| `debug` | `false` | Enable Patcher debug logging. |

There are additional inputs for commit author, PR title, runner, Patcher/Terrapatch versions, and pipelines-credentials/actions repos and refs; see `.github/workflows/patcher.yml` for the full list.

## Outputs

- **`spec`** — The upgrade specification JSON produced by `patcher report` (multiline string).

## Example workflows

Copy and adapt the workflows under **`examples/github/workflows/`** into your repo’s `.github/workflows/`:

| File | Purpose |
|------|---------|
| **`update-dev.yml`** | Update dev dependencies: manual, schedule (e.g. weekly), or `repository_dispatch`; uses `include_dirs: "{*dev*}/**"`. Can trigger the next env when a PR with label `updates-dev` is merged. |
| **`update-stage.yml`** | Same pattern for stage; `include_dirs: "{*stage*}/**"`; triggered by `dev_updates_merged`. |
| **`update-prod.yml`** | Same for prod; `include_dirs: "{*prod*}/**"`; triggered by `stage_updates_merged`. |
| **`patcher.yml`** | Manual-only (“Run workflow”) with inputs for `include_dirs`, `exclude_dirs`, `update_strategy`, `dry_run`, `skip_update`, etc., for ad‑hoc and testing. |
| **`patcher-readme-check.yml`** | Fails the PR if any `README-TO-COMPLETE-UPDATE.md` remain. |
| **`label.yml`** | Labels PRs by changed folders (e.g. `updates-dev`, `updates-stage`). |
