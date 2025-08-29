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

| Name                     | Description                                                                                                                                                                                              | Default                                        |
|--------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------|
| `auth_token`             | Personal Access Token (PAT) used to download binaries and publish pull requests. For GitHub, use a Personal Access Token. For GitLab, use a Personal Access Token or Project Access Token with appropriate permissions. | Required                                       |
| `scm_type`               | Type of SCM provider. Valid options: 'github' or 'gitlab'.                                                                                                                                               | `github`                                       |
| `scm_base_url`           | Base URL for the SCM provider (e.g., 'https://github.company.com' for GitHub Enterprise, 'https://gitlab.company.com' for GitLab).                                                                      | `https://github.com`                          |
| `scm_org`                | Organization/group name in your SCM provider.                                                                                                                                                            | `gruntwork-io`                                 |
| `scm_api_version`        | API version for the SCM provider. Auto-detected based on scm_type if not specified (v3 for GitHub, v4 for GitLab).                                                                                      | Auto-detected                                  |
| `patcher_command`        | Patcher command to run. Valid options: `update` or `report`.                                                                                                                                             | `update`                                       |
| `patcher_git_repo`       | Repository name for downloading patcher cli.                                                                                                                                                             | `patcher-cli`                                  |
| `patcher_version`        | Version of Patcher to use.                                                                                                                                                                               | `v0.15.2`                                      |
| `terrapatch_git_repo`    | Repository name for downloading terrapatch cli.                                                                                                                                                          | `terrapatch-cli`                               |
| `terrapatch_version`     | Version of terrapatch to use.                                                                                                                                                                            | `v0.1.6`                                       |
| `terrapatch_scm_org`     | Organization/group name for terrapatch repository in your SCM provider. Defaults to same as scm_org.                                                                                                    | Same as `scm_org`                              |
| `working_dir`            | Directory where Patcher should run. If empty, it will run in the whole repo.                                                                                                                             |                                                |
| `update_strategy`        | Update strategy. Only used when running `update`. Valid options: `next-safe` or `next-breaking`. Refer to the ["Update Strategies" documentation](https://docs.gruntwork.io/patcher/update-strategies).  | `next-breaking`                                |
| `include_dirs`           | List of directories to include using a double-star glob pattern. Only used when running `report`.                                                                                                        |                                                |
| `exclude_dirs`           | List of directories to exclude using a double-star glob pattern. Only used when running `report`.                                                                                                        |                                                |
| `spec_file`              | Default name of the upgrade specification file. This is used by Patcher to restrict an upgrade to certain dependencies.                                                                                  | `spec.json`                                    |
| `dependency`             | Limit the update to a single dependency. Only used when running `update`. Format: `<org>/<repo>/<name>`. Example: `gruntwork-io/terraform-aws-service-catalog/services/ecs-module`.                      |                                                |
| `commit_author`          | Author of the Pull Request's commits in the format `Name <name@email.com>`. Only used when running `update`. The permissions to push the changes and to create the Pull Request are from 'auth_token'. | `gruntwork-patcher-bot <patcher@gruntwork.io>` |
| `pr_target_branch`       | Branch to use when creating the Pull Request. Required when running `update`.                                                                                                                            |                                                |
| `pr_title`               | Title of the Pull Request. Only used when running `update`.                                                                                                                                              | `[Patcher] Update dependencies`                |
| `dry_run`                | Simulate all operations using Patcher's dry-run mode. Useful for test workflows. Only used when running `update`.                                                                                        | `false`                                        |
| `no_color`               | Whether to disable color output.                                                                                                                                                                         | `false`                                        |

### Action outputs
- `spec`: All discovered dependencies from the given directory using any filters. Only works for `report`.
- `updateResult`: The result of the upgrade. Only works for `update`.

### Using alternative GitHub repositories.

By default, the action retrieves Patcher and Terrapatch from the official Gruntwork repositories. You can also point it
to other repositories, like your own forks, by using these inputs:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: gruntwork-io/patcher-action@v2
    with:
      scm_org: "my-org"                            # Use your organisation instead of gruntwork-io
      patcher_git_repo: "my-patcher-cli"           # Use your fork name if it is different
      terrapatch_git_repo: "my-terrapatch-cli"
```

> [!NOTE]
> The repositories you select must have valid releases. They must use the same asset naming rules as the official
> Gruntwork repos.

### Using with GitHub Enterprise or GitLab

The action supports GitHub Enterprise and GitLab instances in addition to GitHub.com. You can configure the SCM provider using these inputs:

#### GitHub Enterprise Example
```yaml
steps:
  - uses: actions/checkout@v4
  - uses: gruntwork-io/patcher-action@v2
    with:
      scm_base_url: "https://github.company.com"
      scm_type: "github"
      scm_org: "my-org"
      patcher_git_repo: "my-patcher-cli"
      terrapatch_git_repo: "my-terrapatch-cli"
      auth_token: ${{ secrets.GITHUB_ENTERPRISE_TOKEN }}
```

#### GitLab Example
```yaml
steps:
  - uses: actions/checkout@v4
  - uses: gruntwork-io/patcher-action@v2
    with:
      scm_base_url: "https://gitlab.company.com"
      scm_type: "gitlab"
      scm_org: "my-group"
      patcher_git_repo: "my-patcher-cli"
      terrapatch_git_repo: "my-terrapatch-cli"
      auth_token: ${{ secrets.GITLAB_TOKEN }}
```

> [!NOTE]
> - For GitHub Enterprise, use a Personal Access Token with appropriate repository permissions
> - For GitLab, use a Personal Access Token or Project Access Token with `read_api` and `read_repository` scopes
> - The `scm_org` input represents the organization/group name in your SCM provider
> - Repository names should match the naming conventions in your SCM provider
> - API versions are auto-detected (v3 for GitHub, v4 for GitLab) - no need to specify `scm_api_version` in most cases

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

