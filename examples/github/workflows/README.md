
The promotional workflow uses 5 GitHub Actions workflows: 
- `update-dev.yml` - this is the *Update Dev Dependencies* workflow, this workflow can be run periodically or tiggered by a release in an upstream infrastructure module repo
- `update-stage.yml` - this is the *Update Stage Dependencies* workflow
- `update-prod.yml` - this is the *Update Prod Dependencies* workflow
- `patcher.yml` - this is the *Patcher* workflow that prevents a PR being merged if it contains outstanding `README-TO-COMPLETE-UPDATE.md` files
- `labeler.yml` - this is the *Labeler* workflow that ensures that the PRs are correctly labelled

## The Updates Dependencies Workflows

### Config
- The workflows require a GH personal access token to be defined using a secret named `PAT`.

  - In order for the generate PR to trigger other workflows, you need to use a repo scoped [Personal Access Token (PAT)](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token) created on an account that has write access to the repository that pull requests are being created in. This is the standard workaround and [recommended by GitHub](https://docs.github.com/en/actions/using-workflows/triggering-a-workflow#triggering-a-workflow-from-a-workflow).
  - The PAT cannot be scoped to a specific repository, so the token becomes a very sensitive secret. If this is a concern, the PAT can instead be created for a dedicated machine account that has collaborator access to the repository.
  - Note that because the account that owns the PAT will be the creator of pull requests, that user account will be unable to perform actions such as request changes or approve the pull request.
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
