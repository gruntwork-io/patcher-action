# Patcher Action Examples

The promotional workflow uses 5 GitHub Actions workflows: 
- `update-dev.yml` - this is the *Update Dev Dependencies* workflow, this workflow can be run periodically or tiggered by a release in an upstream infrastructure module repo
- `update-stage.yml` - this is the *Update Stage Dependencies* workflow
- `update-prod.yml` - this is the *Update Prod Dependencies* workflow
- `patcher.yml` - this is the *Patcher* workflow that prevents a PR being merged if it contains outstanding `README-TO-COMPLETE-UPDATE.md` files
- `labeler.yml` - this is the *Labeler* workflow that ensures that the PRs are correctly labelled

## The Updates Dependencies Workflows

### Config
- The workflows require tokens to be defined using secrets named `PIPELINES_READ_TOKEN` and optionally `PIPELINES_EXECUTE_TOKEN`:
  - `PIPELINES_READ_TOKEN`: Token used to download Patcher binaries from Gruntwork repositories and read dependency info from Gruntwork module repositories. This token needs read access to gruntwork-io repos.
  - `PIPELINES_EXECUTE_TOKEN`: Token used for 'update' to interact with your repository: get repo info, push changes, and create PRs. This token needs write access to your infrastructure repo. If left unset, `PIPELINES_READ_TOKEN` will be used.

  - To allow the merging of a Pull Request to trigger other workflows, you need to use a repo-scoped GitHub Personal Access Token (PAT) created on an account that has write access to the repository that pull requests are being created in. This is the standard workaround [recommended by GitHub](https://docs.github.com/en/actions/using-workflows/triggering-a-workflow#triggering-a-workflow-from-a-workflow).
  - Patcher uses the PAT to access release information for Gruntwork modules, so it cannot be scoped to a specific repository and the token becomes a very sensitive secret.
  - We strongly recommend creating a GitHub Machine User to issue the PAT. You might name it something like "patcher-bot" or "gruntwork-bot". This has several benefits:
    - All actions taken by this account will be recorded as having been initiated by patcher-bot, so you'll know what's from an automation and what a human user did manually.
    - You can limit the bot's access to exactly the repos needed, in line with the principle of least access.
    - If a human user leaves your GitHub org, the Patcher bot will remain in place.
    - Be sure to safely store the login credentials for this user. For example, at Gruntwork, credentials for GitHub Machine Users are stored in 1Password where they are shared with exactly the right people.

- Environment or account folder names can be set in the workflow file by using the `include_dirs` and `exclude_dirs` action inputs.

For example:
```yaml
  include_dirs: "{*dev*}/**"
```

Will include only directories matching the given double-star glob pattern. This example would include directories named `dev`, `dev2`, `gruntwork-dev-account1` and so on.

### Common Jobs
The 3 update dependencies workflows could be condensed into a single workflow file plus a config file but doing so makes the overall flow harder to follow and describe. So for clarity, we have kept them separate.

#### patcher-report Job

The patcher report job is used to generate a report of the outdated dependencies discovered by Patcher. This report is saved as an upgrade specification (also known as a spec file) which is used in subsequent jobs to influence the upgrade process.

#### update-env Job
Each of the update workflows contains an `update-env` job. This is the job that runs Patcher and creates a PR for the changes.

This job runs only if the workflow was:
- Triggered by an event from another workflow signalling the start of a promotion (`github.event.name == 'repository_dispatch'`)
  - Only the *Update Dev Dependencies* workflow
- Scheduled to run periodically (`github.event.name == 'schedule'`)
  - Only the *Update Dev Dependencies* workflow
- Manually run using the "Run workflow" button in the GitHub Actions UI or using the GH API (`github.event.name == 'workflow_dispatch'`)

#### trigger-next-env Job
The *Update Dev Dependencies* and *Update Stage Dependencies* workflows both have an additional job called `trigger-next-env` which is responsible triggering the workflow for the next environment.

This job runs only if the workflow was triggered by the merging of a PR that has an `updates-<env>` label.

## The Patcher Readme Check Workflow
The *Patcher* workflow consists of a single job that is triggered when a PR is opened, reopened or modified.

The `do-not-merge` job fails if any the branch being merged contains any `README-TO-COMPLETE-UPDATE.md` files.

## The Labeler Workflow
The Labeler GitHub Actions workflow uses the [Pull Request Labeler](https://github.com/actions/labeler) GitHub Action to ensure the PR is correctly labelled.

The action is configured in `.github/labeler.yml` :
- Any changes to the `dev/` folder result in an `updates-dev` label being applied
- Any changes to the `dev2/` folder result in an `updates-dev` label being applied
- Any changes to the `stage/` folder result in an `updates-stage` label being applied
- Any changes to the `prod/` folder result in an `updates-prod` label being applied
- If the PR contains any `README-TO-COMPLETE-UPDATE.md` files the result is a `do-not-merge` label being applied
