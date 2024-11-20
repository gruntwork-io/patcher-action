import * as os from "os";
import * as path from "path";

import * as github from "@actions/github";
import * as toolCache from "@actions/tool-cache";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { Api as GitHub } from "@octokit/plugin-rest-endpoint-methods/dist-types/types";

// Define constants

const GRUNTWORK_GITHUB_ORG = "gruntwork-io";
const PATCHER_GITHUB_REPO = "patcher-cli";
const PATCHER_VERSION = "v0.10.0";
const TERRAPATCH_GITHUB_REPO = "terrapatch-cli";
const TERRAPATCH_VERSION = "v0.1.6";

const HCLEDIT_ORG = "minamijoyo";
const TFUPDATE_GITHUB_REPO = "tfupdate";
const TFUPDATE_VERSION = "v0.6.5";
const HCLEDIT_GITHUB_REPO = "hcledit";
const HCLEDIT_VERSION = "v0.2.5";

const REPORT_COMMAND = "report";
const UPDATE_COMMAND = "update";
const VALID_COMMANDS = [REPORT_COMMAND, UPDATE_COMMAND];

const NON_INTERACTIVE_FLAG = "--non-interactive";
const DRY_RUN_FLAG = "--dry-run";
const NO_COLOR_FLAG = "--no-color";
const INCLUDE_DIRS_FLAG = "--include-dirs";
const EXCLUDE_DIRS_FLAG = "--exclude-dirs";
const SKIP_CONTAINER_FLAG = "--skip-container-runtime";
const UPDATE_STRATEGY_FLAG = "--update-strategy";

const OUTPUT_SPEC_FLAG = "--output-spec";
const SPEC_FILE_FLAG = "--spec-file";
const SPEC_TARGET_FLAG = "--spec-target";

const PUBLISH_FLAG = "--publish";
const PR_TITLE_FLAG = "--pr-title";
const PR_BRANCH_FLAG = "--pr-branch";

// Define types

type PatcherCliArgs = {
  specFile: string;
  includeDirs: string;
  excludeDirs: string;
  updateStrategy: string;
  prBranch: string;
  prTitle: string;
  dependency: string;
  workingDir: string;
  readToken: string;
  updateToken: string;
  dryRun: boolean;
  noColor: boolean;
};

type GitCommitter = {
  name: string;
  email: string;
};

interface DownloadedBinary {
  folder: string;
  name: string;
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

function repoToBinaryMap(repo: string): string {
  switch (repo) {
    case "patcher-cli":
      return "patcher";
    case "terrapatch-cli":
      return "terrapatch";
    default:
      return repo;
  }
}

async function setupBinaryInEnv(binary: DownloadedBinary) {
  const binaryPath = path.join(binary.folder, binary.name);

  core.addPath(binary.folder);

  await exec.exec("chmod", ["+x", binaryPath]);
}

async function downloadGitHubBinary(
  octokit: GitHub,
  owner: string,
  repo: string,
  tag: string,
  token: string
): Promise<DownloadedBinary> {
  const binaryName = repoToBinaryMap(repo);

  // Before downloading, check the cache.
  const pathInCache = toolCache.find(repo, tag);
  if (pathInCache) {
    core.info(`Found ${owner}/${repo} version ${tag} in cache!`);

    return { folder: pathInCache, name: binaryName };
  }

  core.info(`Downloading ${owner}/${repo} version ${tag}`);

  const getReleaseResponse = await octokit.rest.repos.getReleaseByTag({
    owner,
    repo,
    tag,
  });

  const re = new RegExp(`${osPlatform()}.*amd64`);
  const asset = getReleaseResponse.data.assets.find((obj: any) => re.test(obj.name));

  if (!asset) {
    throw new Error(`Can not find ${owner}/${repo} release for ${tag} in platform ${re}.`);
  }

  // Use @actions/tool-cache to download the binary from GitHub
  const downloadedPath = await toolCache.downloadTool(
    asset.url,
    // Don't set a destination path. It will default to a temporary one.
    undefined,
    `token ${token}`,
    {
      accept: "application/octet-stream",
    }
  );

  core.debug(`${owner}/${repo}@'${tag}' has been downloaded at ${downloadedPath}`);

  if (path.extname(asset.name) === ".gz") {
    await exec.exec(`mkdir /tmp/${binaryName}`);
    await exec.exec(`tar -C /tmp/${binaryName} -xzvf ${downloadedPath}`);

    const extractedPath = path.join("/tmp", binaryName, binaryName);

    const cachedPath = await toolCache.cacheFile(extractedPath, binaryName, repo, tag);
    core.debug(`Cached in ${cachedPath}`);

    return { folder: cachedPath, name: binaryName };
  }

  const cachedPath = await toolCache.cacheFile(downloadedPath, binaryName, repo, tag);
  core.debug(`Cached in ${cachedPath}`);

  return { folder: cachedPath, name: binaryName };
}

async function downloadAndSetupTooling(octokit: GitHub, token: string) {
  // Setup the tools also installed in https://hub.docker.com/r/gruntwork/patcher_bash_env
  const tools = [
    {
      org: GRUNTWORK_GITHUB_ORG,
      repo: PATCHER_GITHUB_REPO,
      version: PATCHER_VERSION,
    },
    {
      org: GRUNTWORK_GITHUB_ORG,
      repo: TERRAPATCH_GITHUB_REPO,
      version: TERRAPATCH_VERSION,
    },
    { org: HCLEDIT_ORG, repo: TFUPDATE_GITHUB_REPO, version: TFUPDATE_VERSION },
    { org: HCLEDIT_ORG, repo: HCLEDIT_GITHUB_REPO, version: HCLEDIT_VERSION },
  ];

  for await (const { org, repo, version } of tools) {
    const binary = await downloadGitHubBinary(octokit, org, repo, version, token);
    await setupBinaryInEnv(binary);
  }
}

function isPatcherCommandValid(command: string): boolean {
  return VALID_COMMANDS.includes(command);
}

function reportArgs(
  specFile: string,
  includeDirs: string,
  excludeDirs: string,
  workingDir: string,
  noColor: boolean
): string[] {
  let args = ["report", NON_INTERACTIVE_FLAG, SKIP_CONTAINER_FLAG];

  if (specFile !== "") {
    args = args.concat(`${OUTPUT_SPEC_FLAG}=${specFile}`);
  }

  if (includeDirs !== "") {
    args = args.concat(`${INCLUDE_DIRS_FLAG}=${includeDirs}`);
  }

  if (excludeDirs !== "") {
    args = args.concat(`${EXCLUDE_DIRS_FLAG}=${excludeDirs}`);
  }

  if (noColor) {
    args = args.concat(NO_COLOR_FLAG);
  }

  return args.concat([workingDir]);
}

function updateArgs(
  specFile: string,
  updateStrategy: string,
  prBranch: string,
  prTitle: string,
  dependency: string,
  workingDir: string,
  dryRun: boolean,
  noColor: boolean
): string[] {
  let args = ["update", NON_INTERACTIVE_FLAG, SKIP_CONTAINER_FLAG];

  // If updateStrategy or dependency are not empty, assign them with the appropriate flag.
  // If they are invalid, Patcher will return an error, which will cause the Action to fail.
  if (updateStrategy !== "") {
    args = args.concat(`${UPDATE_STRATEGY_FLAG}=${updateStrategy}`);
  }

  // If a spec file is provided, set the `--spec-file` flag so Patcher can use a custom upgrade spec.
  if (specFile !== "") {
    args = args.concat(`${SPEC_FILE_FLAG}=${specFile}`);
  }

  // If a dependency is provided, set the `--spec-target` flag so Patcher can limit the update to a single dependency.
  if (dependency !== "") {
    args = args.concat(`${SPEC_TARGET_FLAG}=${dependency}`);
  }

  // Ensure a pull request is published
  args = args.concat(PUBLISH_FLAG);

  if (prBranch !== "") {
    args = args.concat(`${PR_BRANCH_FLAG}=${prBranch}`);
  }

  if (prTitle !== "") {
    args = args.concat(`${PR_TITLE_FLAG}=${prTitle}`);
  }

  if (dryRun) {
    args = args.concat(DRY_RUN_FLAG);
  }

  if (noColor) {
    args = args.concat(NO_COLOR_FLAG);
  }

  return args.concat([workingDir]);
}

function getPatcherEnvVars(
  gitCommiter: GitCommitter,
  readToken: string,
  updateToken: string
): { [key: string]: string } {
  const telemetryId = `GHAction-${github.context.repo.owner}/${github.context.repo.repo}`;

  return {
    ...process.env,
    GITHUB_OAUTH_TOKEN: readToken,
    GITHUB_PUBLISH_TOKEN: updateToken,
    PATCHER_TELEMETRY_ID: telemetryId,
    GIT_AUTHOR_NAME: gitCommiter.name,
    GIT_AUTHOR_EMAIL: gitCommiter.email,
  };
}

async function runPatcher(
  gitCommiter: GitCommitter,
  command: string,
  {
    specFile,
    includeDirs,
    excludeDirs,
    updateStrategy,
    prBranch,
    prTitle,
    dependency,
    workingDir,
    readToken,
    updateToken,
    dryRun,
    noColor,
  }: PatcherCliArgs
): Promise<void> {
  switch (command) {
    case REPORT_COMMAND: {
      core.startGroup("Running 'patcher report'");
      const reportOutput = await exec.getExecOutput(
        "patcher",
        reportArgs(specFile, includeDirs, excludeDirs, workingDir, noColor),
        {
          env: getPatcherEnvVars(gitCommiter, readToken, updateToken),
        }
      );
      core.endGroup();

      core.startGroup("Setting upgrade spec output");
      core.setOutput("spec", reportOutput.stdout);
      core.endGroup();

      return;
    }
    default: {
      core.startGroup("Validating `patcher update` args");
      if (prBranch === "") {
        core.setFailed("The pull request branch must be specified when running 'update'");
        return;
      }
      core.endGroup();

      let groupName = "Running 'patcher update'";
      if (dryRun) {
        groupName += " (dry run)";
      }
      core.startGroup(groupName);
      const updateOutput = await exec.getExecOutput(
        "patcher",
        updateArgs(specFile, updateStrategy, prBranch, prTitle, dependency, workingDir, dryRun, noColor),
        {
          env: getPatcherEnvVars(gitCommiter, readToken, updateToken),
        }
      );
      core.endGroup();

      core.startGroup("Setting 'updateResult' output");
      core.setOutput("updateResult", updateOutput.stdout);
      core.endGroup();

      return;
    }
  }
}

function parseCommitAuthor(commitAuthor: string): GitCommitter {
  const pattern = new RegExp(/^([^<]+)\s+<([^>]+)>$/);
  core.debug(`pattern test is  ${pattern.test(commitAuthor)}`);

  const match = commitAuthor.match(pattern);

  if (match) {
    const name = match[1];
    const email = match[2];

    core.debug(`Committer data is ${commitAuthor} -> '${name}' '${email}'`);

    return { name, email };
  }

  throw Error(`Invalid commit_author input: "${commitAuthor}". Should be in the format "Name <name@email.com>"`);
}

async function validateAccessToPatcherCli(octokit: GitHub) {
  try {
    await octokit.rest.repos.get({
      owner: GRUNTWORK_GITHUB_ORG,
      repo: PATCHER_GITHUB_REPO,
    });
  } catch (error: any) {
    if (error.message.includes("Not Found")) {
      throw Error(
        `Can not find the '${PATCHER_GITHUB_REPO}' repo. If you are a Gruntwork customer, contact support@gruntwork.io.`
      );
    } else {
      throw error;
    }
  }
}

export async function run() {
  const gruntworkToken = core.getInput("github_token");
  const patcherReadToken = core.getInput("read_token");
  const patcherUpdateToken = core.getInput("update_token");
  const command = core.getInput("patcher_command");
  const updateStrategy = core.getInput("update_strategy");
  const dependency = core.getInput("dependency");
  const workingDir = core.getInput("working_dir");
  const commitAuthor = core.getInput("commit_author");
  const specFile = core.getInput("spec_file");
  const includeDirs = core.getInput("include_dirs");
  const excludeDirs = core.getInput("exclude_dirs");
  const prBranch = core.getInput("pull_request_branch");
  const prTitle = core.getInput("pull_request_title");
  const dryRun = core.getBooleanInput("dry_run");
  const noColor = core.getBooleanInput("no_color");

  // if the user didn't specify a token specifically for `patcher update`,
  // that's ok, we can try to use the github token instead. doing this adoption
  // is for back compatibility reasons
  const readToken = patcherReadToken ? patcherReadToken : gruntworkToken;
  const updateToken = patcherUpdateToken ? patcherUpdateToken : gruntworkToken;

  // Always mask the token strings in the logs.
  core.setSecret(gruntworkToken);
  core.setSecret(readToken);
  core.setSecret(updateToken);

  // Only run the action if the user has access to Patcher. Otherwise, the download won't work.
  const octokit = github.getOctokit(gruntworkToken);
  await validateAccessToPatcherCli(octokit);

  // Validate if the 'patcher_command' provided is valid.
  if (!isPatcherCommandValid(command)) {
    throw new Error(`Invalid Patcher command ${command}`);
  }
  core.info(`Patcher's ${command}' command will be executed.`);

  // Validate if 'commit_author' has a valid format.
  const gitCommiter = parseCommitAuthor(commitAuthor);

  core.startGroup("Downloading Patcher and patch tools");
  await downloadAndSetupTooling(octokit, gruntworkToken);
  core.endGroup();

  await runPatcher(gitCommiter, command, {
    specFile,
    includeDirs,
    excludeDirs,
    updateStrategy,
    prBranch,
    prTitle,
    dependency,
    workingDir,
    readToken,
    updateToken,
    dryRun,
    noColor,
  });
}
