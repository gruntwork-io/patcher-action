# patcher-action
A GitHub Action for running Patcher.

You can find out more about Gruntwork Patcher at [gruntwork.io](https://gruntwork.io/patcher) and by reading the [latest docs](https://docs.gruntwork.io/patcher/).

## Usage

Refer to the [/examples/github/workflows](/examples/github/workflows) folder for use cases of the action.

### Basic 
It will run `patcher update` in the whole repo, and open a Pull Request with the changes.

```yaml
steps:
  - uses: actions/checkout@v3
  - uses: gruntwork-io/patcher-action
```

### Action inputs

| Name              | Description                                                                                                                                                                                              | Default                                    |
|-------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------|
| `github_token`    | GitHub's Personal Access Token (PAT).                                                                                                                                                                    | `GITHUB_TOKEN`                             |
| `patcher_command` | Patcher command to run. Valid options: `update` or `report`.                                                                                                                                             | `update`                                   |
| `working_dir`     | Directory where Patcher should run. If empty, it will run in the whole repo.                                                                                                                             |                                            |
| `update_strategy` | Update strategy. Only used when running `update`. Valid options: `next-safe` or `next-breaking`.                                                                                                         | `next-safe`                                |
| `dependency`      | Target the update to a single dependency. Only used when running `update`. Format: <org>/<repo>/<name>. Example: gruntwork-io/terraform-aws-service-catalog/services/ecs-module.                         |                                            |
| `commit_author`   | Author of the Pull Request's commits in the format 'Name <name@email.com>'. Only used when running `update`. The permissions to push the changes and to create the Pull Request are from 'github_token'. | `gruntwork-patcher <patcher@gruntwork.io>` |

### Action outputs
- `dependencies`: Terraform and Terragrunt dependencies from the given directory. Only works for `report`.

### Promotion Workflows 

Refer to the [Promotion Workflows with Terraform](https://blog.gruntwork.io/promotion-workflows-with-terraform-13c05bed953d).

