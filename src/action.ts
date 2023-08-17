import * as os from "os";

import * as github from "@actions/github";
import * as toolCache from "@actions/tool-cache";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import {Api} from "@octokit/plugin-rest-endpoint-methods/dist-types/types";

// Define consts
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

function osPlatform() {
  const platform = os.platform();
  switch (platform) {
    case "linux":
    case "darwin":
      return platform;
    default:
      core.setFailed("Unsupported operating system - the Patcher action is only released for Darwin and Linux");
      return;
  }
}

async function openPullRequest(octokit: Api, patcherRawOutput: string, dependency: string, ghToken: string) {
  const head = `patcher-updates-${dependency}`
  const title = `[Patcher] Update ${dependency}`
  const commitMessage = "Update dependencies using Patcher"
  const commitAuthor = "Grunty"
  const commitEmail = "grunty@gruntwork.io"

  const body = `
Updated the \`${dependency}\` dependency using Patcher.

### Update summary
\`\`\`yaml
${patcherRawOutput}
\`\`\`
`

  await exec.exec("git", ["config", "user.name", commitAuthor])
  await exec.exec("git", ["config", "user.email", commitEmail])
  await exec.exec("git", ["add", "."])
  await exec.exec("git", ["commit", "-m", commitMessage])
  await exec.exec("git", ["checkout", "-b", head])

  const context = github.context;

  await exec.exec("git", ["push", "-f", `https://${ghToken}@github.com/${context.repo.owner}/${context.repo.repo}.git`])

  const repoDetails = await octokit.rest.repos.get({...context.repo});
  const base = repoDetails.data.default_branch;
  core.debug(`Base branch is ${base}. Opening the PR against it.`)

  try {
    await octokit.rest.pulls.create({...context.repo, title, head, base, body,});
  } catch (error: any) {
    if (error.message?.includes(`A pull request already exists for`)) {
      core.error(`A pull request for ${head} already exists. The branch was updated.`)
    } else {
      throw error
    }
  }
}

async function downloadPatcherBinary(octokit: Api, owner: string, repo: string, tag: string, ghToken: string): Promise<string> {
  core.info(`Downloading Patcher version ${tag}`);


  const getReleaseResponse = await octokit.rest.repos.getReleaseByTag({owner, repo, tag})

  const re = new RegExp(`${osPlatform()}.*amd64`)
  const asset = getReleaseResponse.data.assets.find((obj: any) => (re.test(obj.name)));

  if (!asset) {
    throw new Error(`Can not find Patcher release for ${tag} in platform ${re}.`)
  }

  // Use @actions/tool-cache to download Patcher's binary from GitHub
  const patcherBinaryPath = await toolCache.downloadTool(asset.url,
    PATCHER_BINARY_PATH,
    `token ${ghToken}`,
    {
      accept: 'application/octet-stream'
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

  // If updateStrategy or dependency are not empty, are not empty, assign them with the appropriate flag.
  // If they are invalid, Patcher will return an error, which will cause the Action to fail.
  if (updateStrategy !== "") {
    args = args.concat(`--update-strategy=${updateStrategy}`)
  }

  // If a dependency is provided, set the `target` flag so Patcher can limit the update to a single dependency.
  if (dependency !== "") {
    args = args.concat(`--target=${dependency}`)
  }

  return args.concat([workingDir]);
}

function getPatcherEnvVars(token: string): { [key: string]: string } {
  const telemetryId = `GHAction-${github.context.repo.owner}/${github.context.repo.repo}`;

  return {
    "GITHUB_OAUTH_TOKEN": token,
    "PATCHER_TELEMETRY_ID": telemetryId,
    "HOME": "."
  };
}

type PatcherCliArgs = {
  updateStrategy: string;
  dependency: string;
  workingDir: string;
  token: string;
}

async function runPatcher(octokit: Api, binaryPath: string, command: string, {
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
        {env: getPatcherEnvVars(token)});
      core.endGroup()

      core.startGroup("Setting 'dependencies' output")
      core.setOutput("dependencies", reportOutput.stdout)
      core.endGroup()

      return
    default:
      core.startGroup("Running 'patcher update'")
      const updateOutput = await exec.getExecOutput(binaryPath,
        updateArgs(updateStrategy, dependency, workingDir),
        {env: getPatcherEnvVars(token)});
      core.endGroup()

      core.startGroup("Opening pull request")
      await openPullRequest(octokit, updateOutput.stdout, dependency, token)
      core.endGroup()

      return
  }
}

export async function run() {
  const token = core.getInput("github_token")
  // Patcher will default to UPDATE_COMMAND.
  const command = core.getInput("patcher_command") || UPDATE_COMMAND
  const updateStrategy = core.getInput("update_strategy")
  const dependency = core.getInput("dependency")
  const workingDir = core.getInput("working_dir")

  if (!isPatcherCommandValid(command)) {
    throw new Error(`Invalid Patcher command ${command}`)
  }

  core.info(`Patcher's ${command}' command will be executed.`);

  const octokit = github.getOctokit(token);

  core.startGroup("Download Patcher")

  const patcherPath = await downloadPatcherBinary(octokit, GRUNTWORK_GITHUB_ORG, PATCHER_GITHUB_REPO, PATCHER_VERSION, token);

  core.endGroup()

  core.startGroup("Granting permissions to Patcher's binary")
  await exec.exec("chmod", ["+x", patcherPath])
  core.endGroup()

  await runPatcher(octokit, patcherPath, command, {updateStrategy, dependency, workingDir, token})
}
