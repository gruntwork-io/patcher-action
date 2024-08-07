# patcher-action
A GitHub Action for running Patcher.

> [!IMPORTANT]
> Patcher is currently in beta and is only available to Gruntwork customers. If you're interested in using Patcher to update your
> Terraform/Terragrunt dependencies, please contact our sales team at sales@gruntwork.io.

You can find out more about Gruntwork Patcher at [gruntwork.io](https://gruntwork.io/patcher) and by reading the [latest docs](https://docs.gruntwork.io/patcher/).

## Usage

Refer to the [/examples/github/workflows](/examples/github/workflows) folder for use cases of the action.

### Basic 
It will run `patcher update` in the whole repo, and open a Pull Request with the changes.

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: gruntwork-io/patcher-action
```

### Action inputs

| Name              | Description                                                                                                                                                                                                  | Default                                        |
|-------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------|
| `github_token`        | GitHub's Personal Access Token (PAT).                                                                                                                                                                    | `GITHUB_TOKEN`                                 |
| `patcher_command`     | Patcher command to run. Valid options: `update` or `report`.                                                                                                                                             | `update`                                       |
| `working_dir`         | Directory where Patcher should run. If empty, it will run in the whole repo.                                                                                                                             |                                                |
| `update_strategy`     | Update strategy. Only used when running `update`. Valid options: `next-safe` or `next-breaking`. Refer to the ["Update Strategies" documentation](https://docs.gruntwork.io/patcher/update-strategies).  | `next-breaking`                                |
| `include_dirs`        | List of directories to include using a double-star glob pattern. Only used when running `report`.                                                                                                        |                                                |
| `exclude_dirs`        | List of directories to exclude using a double-star glob pattern. Only used when running `report`.                                                                                                        |                                                |
| `spec_file`           | Default name of the upgrade specification file. This is used by Patcher to restrict an upgrade to certain dependencies.                                                                                  | `spec.json`                                    |
| `dependency`          | Limit the update to a single dependency. Only used when running `update`. Format: `<org>/<repo>/<name>`. Example: `gruntwork-io/terraform-aws-service-catalog/services/ecs-module`.                      |                                                |
| `commit_author`       | Author of the Pull Request's commits in the format `Name <name@email.com>`. Only used when running `update`. The permissions to push the changes and to create the Pull Request are from 'github_token'. | `gruntwork-patcher-bot <patcher@gruntwork.io>` |
| `pull_request_branch` | Branch to use when creating the Pull Request. Required when running `update`.                                                                                                                            |                                                |
| `pull_request_title`  | Title of the Pull Request. Only used when running `update`.                                                                                                                                              | `[Patcher] Update dependencies`                |
| `dry_run`             | Simulate all operations using Patcher's dry-run mode. Useful for test workflows. Only used when running `update`.                                                                                        | `false`                                        |
| `no_color`            | Whether to disable color output.                                                                                                                                                                         | `false`                                        |

### Action outputs
- `spec`: All discovered dependencies from the given directory using any filters. Only works for `report`.
- `updateResult`: The result of the upgrade. Only works for `update`.

### Promotion Workflows 

Refer to the [Promotion Workflows with Terraform](https://blog.gruntwork.io/promotion-workflows-with-terraform-13c05bed953d).

## Developer Setup

If you need to make changes to the action, you can build it locally with the following commands:

```sh
# install dependencies
yarn

# run the tests
yarn test

# build a release
yarn build
```

