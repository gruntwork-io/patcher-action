import * as os from "os";
import * as yaml from "yaml";

import * as github from "@actions/github";
import * as toolCache from "@actions/tool-cache";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { Api as GitHub } from "@octokit/plugin-rest-endpoint-methods/dist-types/types";

// Define constants

const GRUNTWORK_GITHUB_ORG = "gruntwork-io";
const PATCHER_GITHUB_REPO = "patcher-cli";
const PATCHER_VERSION = "v0.4.3";
const PATCHER_BINARY_PATH = "/tmp/patcher"

const REPORT_COMMAND = "report";
const UPDATE_COMMAND = "update";
const VALID_COMMANDS = [REPORT_COMMAND, UPDATE_COMMAND];

const NON_INTERACTIVE_FLAG = "--non-interactive"
const NO_COLOR_FLAG = "--no-color"
const SKIP_CONTAINER_FLAG = "--skip-container-runtime"
const UPDATE_STRATEGY_FLAG = "--update-strategy"
const TARGET_FLAG = "--target"

// Define types

type PatcherCliArgs = {
  updateStrategy: string;
  dependency: string;
  workingDir: string;
  token: string;
}

type GitCommitter = {
  name: string;
  email: string;
}

function osPlatform() {
  const platform = os.platform();
  switch (platform) {
    case "linux":
    case "darwin":
      return platform;
    default:
      throw new Error("Unsupported operating system - the Patcher action is only released for Darwin and Linux");
  }
}

// pullRequestBranch formats the branch name. When dependency and workingDir are provided, the branch format will be
// patcher-dev-updates-gruntwork-io/terraform-aws-vpc/vpc-app`.
function pullRequestBranch(dependency: string, workingDir: string): string {
  let branch = "patcher"

  if (workingDir) {
    branch += `-${workingDir}`
  }
  branch += "-updates"

  if (dependency) {
    branch += `-${dependency}`
  }

  return branch;
}

// pullRequestTitle formats the Pull Request title. When dependency and workingDir are provided, the title will be
// [Patcher] [dev] Update gruntwork-io/terraform-aws-vpc/vpc-app dependency
function pullRequestTitle(dependency: string, workingDir: string): string {
  let title = "[Patcher]"

  if (workingDir) {
    title += ` [${workingDir}]`
  }

  if (dependency) {
    title += ` Update ${dependency} dependency`
  } else {
    title += " Update dependencies"
  }

  return title
}


export interface PatcherUpdateSummary {
  successful_updates:           SuccessfulUpdate[];
  manual_steps_you_must_follow: ManualStepsYouMustFollow[];
}

export interface ManualStepsYouMustFollow {
  instructions_file_path: string;
}

export interface SuccessfulUpdate {
  file_path:       string;
  updated_modules: UpdatedModule[];
}

export interface UpdatedModule {
  repo:                  string;
  module:                string;
  previous_version:      string;
  updated_version:       string;
  next_breaking_version: NextBreakingVersion;
  patches_applied:       PatchesApplied;
}

export interface NextBreakingVersion {
  version:           string;
  release_notes_url: string;
}

export interface PatchesApplied {
  slugs: string[];
  manual_scripts: string[];
  count: number;
}

function pullRequestBodyUpdatedModules(modules: UpdatedModule[]): string {
  // TODO do not show patches applied if count = 0
  return modules.map(module => (`  - Previous version: ${module.previous_version}
  - Updated version: ${module.updated_version} ([Release notes for ${module.next_breaking_version.version}](${module.next_breaking_version.release_notes_url}))
  - Patches applied: ${module.patches_applied.count}`)).join("\n");
}

function pullRequestBodySuccessfulUpdates(updatedModules: SuccessfulUpdate[]): string {
  if (updatedModules) {
    return updatedModules.map(module => (`- ${module.file_path}
${pullRequestBodyUpdatedModules(module.updated_modules)}`)).join("\n");
  }

  return "";
}

function pullRequestBodyReadmeToUpdate(manualSteps: ManualStepsYouMustFollow[]): string {
 if (manualSteps) {
   return  `\n1. Follow the instructions outlined in the \`README-TO-COMPLETE-UPDATE.md\` file and delete it once the update is complete.`
 }

 return "";
}

export function pullRequestBody(patcherRawOutput: string, dependency: string): string {
  const updateSummary = yaml.parse(patcherRawOutput) as PatcherUpdateSummary;

  return `:robot: This is an automated pull request opened by [Patcher](https://docs.gruntwork.io/patcher/).

## Description

Updated the \`${dependency}\` dependency.

### Updated files

${pullRequestBodySuccessfulUpdates(updateSummary.successful_updates)}

<details>
  <summary>Raw output from \`patcher update\`</summary>
  \`\`\`yaml
${patcherRawOutput}
  \`\`\`
</details>

## Steps to review

1. Check the proposed changes to the \`terraform\` and/or \`terragrunt\` configuration files.${pullRequestBodyReadmeToUpdate(updateSummary.manual_steps_you_must_follow)}
1. Validate the changes in the infrastructure by running \`terraform/terragrunt plan\`.
1. Upon approval, proceed with deploying the infrastructure changes.`
}

async function wasCodeUpdated() {
  const output = await exec.getExecOutput("git", ["status", "--porcelain"])
  // If there are changes, they will appear in the stdout. Otherwise, it returns blank.
  return !!output.stdout;
}

async function commitAndPushChanges(gitCommiter: GitCommitter, dependency: string, workingDir: string, token: string) {
  const { owner, repo } = github.context.repo;
  const head = pullRequestBranch(dependency, workingDir)

  // Setup https auth and https remote url
  await exec.exec("git", ["remote", "set-url", "origin", `https://${token}@github.com/${owner}/${repo}.git`])

  // Setup committer name and email
  await exec.exec("git", ["config", "user.name", gitCommiter.name])
  await exec.exec("git", ["config", "user.email", gitCommiter.email])

  // Checkout to new branch and commit
  await exec.exec("git", ["checkout", "-b", head])
  await exec.exec("git", ["add", "."])

  const commitMessage = "Update dependencies using Patcher by Gruntwork"
  await exec.exec("git", ["commit", "-m", commitMessage])

  // Push changes to head branch
  await exec.exec("git", ["push", "--force", "origin", `${head}:refs/heads/${head}`])
}

async function openPullRequest(octokit: GitHub, gitCommiter: GitCommitter, patcherRawOutput: string, dependency: string, workingDir: string, token: string) {
  const { repo } = github.context;

  const head = pullRequestBranch(dependency, workingDir)
  const title = pullRequestTitle(dependency, workingDir)
  const body = pullRequestBody(patcherRawOutput, dependency)

  const repoDetails = await octokit.rest.repos.get({ ...repo });
  const base = repoDetails.data.default_branch;
  core.debug(`Base branch is ${base}. Opening the PR against it.`)

  try {
    await octokit.rest.pulls.create({ ...repo, title, head, base, body });
  } catch (error: any) {
    if (error.message?.includes(`A pull request already exists for`)) {
      core.error(`A pull request for ${head} already exists. The branch was updated.`)
    } else {
      throw error
    }
  }
}

async function downloadPatcherBinary(octokit: GitHub, owner: string, repo: string, tag: string, token: string): Promise<string> {
  core.info(`Downloading Patcher version ${tag}`);

  const getReleaseResponse = await octokit.rest.repos.getReleaseByTag({ owner, repo, tag })

  const re = new RegExp(`${osPlatform()}.*amd64`)
  const asset = getReleaseResponse.data.assets.find((obj: any) => (re.test(obj.name)));

  if (!asset) {
    throw new Error(`Can not find Patcher release for ${tag} in platform ${re}.`)
  }

  // Use @actions/tool-cache to download Patcher's binary from GitHub
  const patcherBinaryPath = await toolCache.downloadTool(asset.url,
    PATCHER_BINARY_PATH,
    `token ${token}`,
    {
      accept: "application/octet-stream"
    }
  );

  core.debug(`Patcher version '${tag}' has been downloaded at ${patcherBinaryPath}`);
  return patcherBinaryPath;
}

function isPatcherCommandValid(command: string): boolean {
  return VALID_COMMANDS.includes(command);
}

function updateArgs(updateStrategy: string, dependency: string, workingDir: string): string[] {
  let args = ["update", NO_COLOR_FLAG, NON_INTERACTIVE_FLAG, SKIP_CONTAINER_FLAG];

  // If updateStrategy or dependency are not empty, assign them with the appropriate flag.
  // If they are invalid, Patcher will return an error, which will cause the Action to fail.
  if (updateStrategy !== "") {
    args = args.concat(`${UPDATE_STRATEGY_FLAG}=${updateStrategy}`)
  }

  // If a dependency is provided, set the `target` flag so Patcher can limit the update to a single dependency.
  if (dependency !== "") {
    args = args.concat(`${TARGET_FLAG}=${dependency}`)
  }

  return args.concat([workingDir]);
}

function getPatcherEnvVars(token: string): { [key: string]: string } {
  const telemetryId = `GHAction-${github.context.repo.owner}/${github.context.repo.repo}`;

  return {
    ...process.env,
    "GITHUB_OAUTH_TOKEN": token,
    "PATCHER_TELEMETRY_ID": telemetryId,
  };
}

async function runPatcher(octokit: GitHub, gitCommiter: GitCommitter, binaryPath: string, command: string, {
  updateStrategy,
  dependency,
  workingDir,
  token
}: PatcherCliArgs): Promise<void> {
  switch (command) {
    case REPORT_COMMAND:
      core.startGroup("Running 'patcher report'")
      const reportOutput = await exec.getExecOutput(binaryPath,
        [command, NON_INTERACTIVE_FLAG, workingDir],
        { env: getPatcherEnvVars(token) });
      core.endGroup()

      core.startGroup("Setting 'dependencies' output")
      core.setOutput("dependencies", reportOutput.stdout)
      core.endGroup()

      return
    default:
      core.startGroup("Running 'patcher update'")
      const updateOutput = await exec.getExecOutput(binaryPath,
        updateArgs(updateStrategy, dependency, workingDir),
        { env: getPatcherEnvVars(token) });
      core.endGroup()

      if (await wasCodeUpdated()) {
        core.startGroup("Commit and push changes")
        await commitAndPushChanges(gitCommiter, dependency, workingDir, token)
        core.endGroup()

        core.startGroup("Opening pull request")
        await openPullRequest(octokit, gitCommiter, updateOutput.stdout, dependency, workingDir, token)
        core.endGroup()
      } else {
        core.info(`No changes in ${dependency} after running Patcher. No further action is necessary.`)
      }

      return
  }
}

function parseCommitAuthor(commitAuthor: string): GitCommitter {
  const pattern = new RegExp(/^([^<]+)\s+<([^>]+)>$/);
  core.debug(`pattern test is  ${pattern.test(commitAuthor)}`)

  const match = commitAuthor.match(pattern);

  if (match) {
    const name = match[1];
    const email = match[2];

    core.debug(`Committer data is ${commitAuthor} -> '${name}' '${email}'`)

    return { name, email };
  }

  throw Error(`Invalid commit_author input: "${commitAuthor}". Should be in the format "Name <name@email.com>"`)
}

async function validateAccessToPatcherCli(octokit: GitHub) {
  try {
    await octokit.rest.repos.get({
      owner: GRUNTWORK_GITHUB_ORG,
      repo: PATCHER_GITHUB_REPO,
    });
  } catch (error: any) {
    if (error.message.includes("Not Found")) {
      throw Error(`Can not find the '${PATCHER_GITHUB_REPO}' repo. If you are a Gruntwork customer, contact support@gruntwork.io.`)
    } else {
      throw error;
    }
  }
}

export async function run() {
  const token = core.getInput("github_token")
  const command = core.getInput("patcher_command")
  const updateStrategy = core.getInput("update_strategy")
  const dependency = core.getInput("dependency")
  const workingDir = core.getInput("working_dir")
  const commitAuthor = core.getInput("commit_author")

  // Always mask the `token` string in the logs.
  core.setSecret(token)

  // Only run the action if the user has access to Patcher. Otherwise, the download won't work.
  const octokit = github.getOctokit(token);
  await validateAccessToPatcherCli(octokit);

  // Validate if the 'patcher_command' provided is valid.
  if (!isPatcherCommandValid(command)) {
    throw new Error(`Invalid Patcher command ${command}`)
  }
  core.info(`Patcher's ${command}' command will be executed.`);

  // Validate if 'commit_author' has a valid format.
  const gitCommiter = parseCommitAuthor(commitAuthor);

  core.startGroup("Downloading Patcher")
  const patcherPath = await downloadPatcherBinary(octokit, GRUNTWORK_GITHUB_ORG, PATCHER_GITHUB_REPO, PATCHER_VERSION, token);
  core.endGroup()

  core.startGroup("Granting permissions to Patcher's binary")
  await exec.exec("chmod", ["+x", patcherPath])
  core.endGroup()

  await runPatcher(octokit, gitCommiter, patcherPath, command, { updateStrategy, dependency, workingDir, token })
}
