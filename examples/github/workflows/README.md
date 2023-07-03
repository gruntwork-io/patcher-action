
The promotional workflow uses 5 GitHub Actions workflows: 
- `update-dev.yml` - this is the *Update Dev Dependencies* workflow, this workflow can be run periodically or tiggered by a release in an upstream infrastructure module repo
- `update-stage.yml` - this is the *Update Stage Dependencies* workflow
- `update-prod.yml` - this is the *Update Prod Dependencies* workflow
- `patcher.yml` - this is the *Patcher* workflow that prevents a PR being merged if it contains outstanding `README-TO-COMPLETE-UPDATE.md` files
- `labeler.yml` - this is the *Labeler* workflow that ensures that the PRs are correctly labelled

## The Updates Dependencies Workflows

### Config
- The workflows require a [GitHub Personal Access Token](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token) to be defined using a secret named `PAT`.

  - To allow the merging of a Pull Request to trigger other workflows, you need to use a repo-scoped GitHub Personal Access Token (PAT) created on an account that has write access to the repository that pull requests are being created in. This is the standard workaround [recommended by GitHub](https://docs.github.com/en/actions/using-workflows/triggering-a-workflow#triggering-a-workflow-from-a-workflow).
  - Patcher uses the PAT to access release information for Gruntwork modules, so it cannot be scoped to a specific repository and the token becomes a very sensitive secret.
  - We strongly recommend creating a GitHub Machine User to issue the personal access token. You might name it something like “patcher-bot” or “gruntwork-bot” This has several benefits:
    - All actions taken by this account will be recorded as having been initiated by patcher-bot, so you’ll know what’s from an automation and what a human user did manually.
    - You can limit the bot’s access to exactly the repos needed, in line with the principle of least access.
    - If a human user leaves your GitHub org, the Patcher bot will remain in place.
    - Be sure to safely store the login credentials for this user. For example, at Gruntwork, credentials for GitHub Machine Users are stored in 1Password where they are shared with exactly the right people.

- The environment folder name is set in the workflow file using the `ENV_FOLDER_NAME` environment variable.

For example:
```yaml
  env:
    GITHUB_OAUTH_TOKEN: ${{ secrets.PAT }}
    ENV_FOLDER_NAME: prod
```

### Common Jobs
The 3 update dependencies workflows could be condensed into a single workflow file plus a config file but doing so makes the overall flow harder to follow and describe. So for clarity, we have kept them separate.

####  update-env Job
Each of the update workflows contains a `update-env` job. This is the job that runs Patcher and creates a PR for the changes.

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

The `do-not-merge job` fails if any the branch being merged contains any `README-TO-COMPLETE-UPDATE.md` files.

## The Labeler Workflow
The Labeler GitHub Actions workflow uses the [Pull Request Labeler](https://github.com/actions/labeler) GitHub Action to ensure the PR is correctly labelled.

The action is configured in `.github/labeler.yml` :
- Any changes to the `dev/` folder result in an `updates-dev` label being applied
- Any changes to the `stage/` folder result in an `updates-stage` label being applied
- Any changes to the `prod/` folder result in an `updates-prod` label being applied
- If the PR contains any `README-TO-COMPLETE-UPDATE.md` files the result is a `do-not-merge` label being applied
