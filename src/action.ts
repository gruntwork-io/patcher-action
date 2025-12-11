import * as os from "os";
import * as path from "path";

import * as github from "@actions/github";
import * as toolCache from "@actions/tool-cache";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { Octokit } from "@octokit/rest";
import { Api as GitHub } from "@octokit/plugin-rest-endpoint-methods/dist-types/types";

// Define constants

const PATCHER_ORG = core.getInput("github_org") || "gruntwork-io";
const PATCHER_GIT_REPO = core.getInput("patcher_git_repo") || "patcher-cli";
const PATCHER_VERSION = core.getInput("patcher_version") || "v0.16.0";
const TERRAPATCH_ORG = core.getInput("terrapatch_github_org") || core.getInput("github_org") || "gruntwork-io";
const TERRAPATCH_GIT_REPO = core.getInput("terrapatch_git_repo") || "terrapatch-cli";
const TERRAPATCH_VERSION = core.getInput("terrapatch_version") || "v0.1.6";
const TFUPDATE_ORG = "minamijoyo";
const TFUPDATE_GITHUB_REPO = "tfupdate";
const TFUPDATE_VERSION = "v0.6.5";
const HCLEDIT_ORG = "minamijoyo";
const HCLEDIT_GITHUB_REPO = "hcledit";
const HCLEDIT_VERSION = "v0.2.5";

const GRUNTWORK_TOOLS = [PATCHER_GIT_REPO, TERRAPATCH_GIT_REPO] as const;
const PUBLIC_TOOLS = [TFUPDATE_GITHUB_REPO, HCLEDIT_GITHUB_REPO] as const;

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

interface GitHubConfig {
  baseUrl: string;
  apiVersion: string;
  token: string;
}

interface ReleaseAsset {
  name: string;
  url: string;
  browser_download_url?: string;
}

interface Release {
  assets: ReleaseAsset[];
  tag_name: string;
}

interface GitHubProviderInterface {
  getReleaseByTag(owner: string, repo: string, tag: string): Promise<Release>;
  validateAccess(owner: string, repo: string): Promise<void>;
}

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
  executeToken: string;
  dryRun: boolean;
  noColor: boolean;
  debug: boolean;
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
    case "win32":
      return "windows";
    default:
      throw new Error(
        "Unsupported operating system - the Patcher action is only released for Darwin, Linux, and Windows32."
      );
  }
}

function arch() {
  const arch = os.arch();
  switch (arch) {
    case "arm64":
      return arch;
    case "x64":
      return "amd64";
    case "ia32":
      return "386";
    default:
      throw new Error("Unsupported architecture - the Patcher action is only released for arm64, amd64, and i386.");
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

class GitHubProvider implements GitHubProviderInterface {
  private octokit: GitHub;

  constructor(config: GitHubConfig) {
    // Use Octokit directly to bypass @actions/github HTTP protocol restrictions (HTTPS is otherwise required)
    // Users shouldn't do this, but some will run their GitHub Enterprise instance over plain HTTP.
    // If they specify an HTTP baseUrl, we'lll honor the HTTP protocol.
    this.octokit = new Octokit({
      auth: config.token,
      baseUrl:
        config.baseUrl === "https://github.com"
          ? "https://api.github.com"
          : `${config.baseUrl}/api/${config.apiVersion}`,
    });
  }

  async getReleaseByTag(owner: string, repo: string, tag: string): Promise<Release> {
    try {
      const response = await this.octokit.rest.repos.getReleaseByTag({
        owner,
        repo,
        tag,
      });
      return response.data;
    } catch (error: any) {
      if (error.status === 404) {
        throw new Error(
          `Release '${tag}' not found in repository '${owner}/${repo}'. Please check the repository exists and the tag is correct.`
        );
      } else if (error.status === 401 || error.status === 403) {
        throw new Error(
          `Authentication failed when accessing '${owner}/${repo}'. Please check your token permissions.`
        );
      } else {
        throw error;
      }
    }
  }

  async validateAccess(owner: string, repo: string): Promise<void> {
    try {
      await this.octokit.rest.repos.get({
        owner,
        repo,
      });
    } catch (error: any) {
      if (error.status === 404 || error.message.includes("Not Found")) {
        if (owner !== "gruntwork-io") {
          core.warning(
            `Cannot validate access to '${owner}/${repo}' repository. This may be due to token permissions or repository visibility. Proceeding with download attempt.`
          );
          return;
        }
        throw Error(
          `Cannot access the '${repo}' repository. This could indicate: 1) The repository doesn't exist, 2) Your token doesn't have access to this repository, or 3) Your token lacks the 'repo' scope for private repositories. Please check your token permissions and repository access. If you continue to have issues and are a Gruntwork customer, contact support@gruntwork.io.`
        );
      } else {
        throw error;
      }
    }
  }
}

function createGitHubProvider(config: GitHubConfig): GitHubProviderInterface {
  return new GitHubProvider(config);
}

function findCompatibleAsset(release: Release, owner: string, repo: string, tag: string): ReleaseAsset {
  const re = new RegExp(`${osPlatform()}.*${arch()}`);
  const asset = release.assets.find((obj: ReleaseAsset) => re.test(obj.name));

  if (!asset) {
    throw new Error(`Can not find ${owner}/${repo} release for ${tag} in platform ${re}.`);
  }

  return asset;
}

function determineDownloadConfig(
  asset: ReleaseAsset,
  repo: string,
  token: string
): { assetUrl: string; authHeader: string | undefined; headers: Record<string, string> } {
  // Always use the API URL for consistent authentication behavior
  const assetUrl = asset.url;

  core.debug(`Selected asset URL for ${assetUrl} (using API URL)`);

  // Determine authentication and headers
  let authHeader: string | undefined;
  const headers: Record<string, string> = {};

  // Asset API URL: always needs proper authentication
  if (token) {
    authHeader = `Bearer ${token}`;
  }
  // Asset API requires specific headers
  headers.accept = "application/octet-stream";
  headers["X-GitHub-Api-Version"] = "2022-11-28";

  return { assetUrl, authHeader, headers };
}

async function downloadAssetWithRetry(
  assetUrl: string,
  authHeader: string | undefined,
  headers: Record<string, string>,
  owner: string,
  repo: string,
  tag: string,
  token: string
): Promise<string> {
  const isPublicTool = PUBLIC_TOOLS.includes(repo as any);

  // For public tools, temporarily unset GITHUB_BASE_URL to avoid protocol conflicts
  const originalGithubBaseUrl = process.env.GITHUB_BASE_URL;
  if (isPublicTool) {
    delete process.env.GITHUB_BASE_URL;
  }

  try {
    return await toolCache.downloadTool(assetUrl, undefined, authHeader, headers);
  } catch (err: any) {
    const status = (err?.status || err?.code || "").toString();
    const isAuthIssue = status === "404" || status === "403";

    if (isPublicTool && authHeader && isAuthIssue) {
      // For public tools, try without auth
      core.warning(
        `Authenticated download of public asset ${owner}/${repo}@${tag} failed (${status}); retrying without a token.`
      );
      try {
        return await toolCache.downloadTool(assetUrl, undefined, undefined, {});
      } catch (retryErr: any) {
        throw new Error(
          `Public download failed for ${owner}/${repo}@${tag} after unauthenticated retry: ${
            retryErr?.message || retryErr
          }. The provided token may block public downloads. Remove the token for public tools or adjust its permissions.`
        );
      }
    } else if (!isPublicTool && isAuthIssue) {
      throw new Error(
        `Failed to download private asset ${owner}/${repo}@${tag}: ${err?.message || err}. ` +
          `Ensure the provided token has 'repo' scope and access to ${owner}/${repo}.`
      );
    } else if (!token && isAuthIssue) {
      throw new Error(
        `Asset API download requires authentication even for public repos. ` +
          `Failed to download ${owner}/${repo}@${tag}: ${err?.message || err}. ` +
          `Provide a token with appropriate permissions.`
      );
    } else {
      throw err;
    }
  } finally {
    // Restore the original GITHUB_BASE_URL for public tools
    if (isPublicTool && originalGithubBaseUrl) {
      process.env.GITHUB_BASE_URL = originalGithubBaseUrl;
    }
  }
}

async function extractAndCacheBinary(
  downloadedPath: string,
  asset: ReleaseAsset,
  binaryName: string,
  repo: string,
  tag: string
): Promise<DownloadedBinary> {
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

async function downloadGitHubBinary(
  githubProvider: GitHubProviderInterface,
  owner: string,
  repo: string,
  tag: string,
  token: string
): Promise<DownloadedBinary> {
  const binaryName = repoToBinaryMap(repo);
  const isPublicTool = PUBLIC_TOOLS.includes(repo as any);

  // Check cache first
  const pathInCache = toolCache.find(repo, tag);
  if (pathInCache) {
    core.info(`Found ${owner}/${repo} version ${tag} in cache!`);
    return { folder: pathInCache, name: binaryName };
  }

  core.info(`Downloading ${owner}/${repo} version ${tag}`);

  // For public tools, try with token first, then without if it fails
  let release: Release;
  let asset: ReleaseAsset;

  try {
    // First attempt: try to get release with token
    release = await githubProvider.getReleaseByTag(owner, repo, tag);
    asset = findCompatibleAsset(release, owner, repo, tag);
  } catch (error: any) {
    if (isPublicTool && (error.status === 401 || error.status === 403)) {
      // For public tools, if authentication fails, try without token
      core.warning(
        `Authenticated access to public repository ${owner}/${repo} failed (${error.status}); retrying without token.`
      );

      // Create a tokenless provider for retry
      const tokenlessConfig: GitHubConfig = {
        baseUrl: "https://github.com",
        apiVersion: "v3",
        token: "",
      };
      const tokenlessProvider = createGitHubProvider(tokenlessConfig);

      release = await tokenlessProvider.getReleaseByTag(owner, repo, tag);
      asset = findCompatibleAsset(release, owner, repo, tag);
    } else {
      throw error;
    }
  }

  // Determine download configuration
  const { assetUrl, authHeader, headers } = determineDownloadConfig(asset, repo, token);

  // Download the asset with retry logic
  const downloadedPath = await downloadAssetWithRetry(assetUrl, authHeader, headers, owner, repo, tag, token);

  core.debug(`${owner}/${repo}@'${tag}' has been downloaded at ${downloadedPath}`);

  // Extract and cache the binary
  return await extractAndCacheBinary(downloadedPath, asset, binaryName, repo, tag);
}

async function downloadAndSetupTooling(
  userGitHubProvider: GitHubProviderInterface,
  githubComProvider: GitHubProviderInterface,
  userToken: string
) {
  const tools = [
    { org: PATCHER_ORG, repo: PATCHER_GIT_REPO, version: PATCHER_VERSION },
    { org: TERRAPATCH_ORG, repo: TERRAPATCH_GIT_REPO, version: TERRAPATCH_VERSION },
    { org: TFUPDATE_ORG, repo: TFUPDATE_GITHUB_REPO, version: TFUPDATE_VERSION },
    { org: HCLEDIT_ORG, repo: HCLEDIT_GITHUB_REPO, version: HCLEDIT_VERSION },
  ];

  for await (const { org, repo, version } of tools) {
    const isPublicTool = PUBLIC_TOOLS.includes(repo as any);
    const isGruntworkTool = GRUNTWORK_TOOLS.includes(repo as any);

    const githubProvider = isPublicTool ? githubComProvider : userGitHubProvider;
    const token = userToken || "";
    const toolType = isPublicTool ? "Public" : isGruntworkTool ? "Gruntwork" : "User";
    core.debug(
      `Tool ${org}/${repo}@${version}: type=${toolType} provider=${isPublicTool ? "github.com" : "user"} token=${
        token ? "present" : "none"
      }`
    );

    if (!isPublicTool) {
      try {
        await githubProvider.validateAccess(org, repo);
      } catch (e: any) {
        core.warning(`Preflight access check failed for ${org}/${repo}: ${e?.message || e}`);
      }
    }

    // For public tools, try with the current provider first, then create a tokenless one if it fails
    let binary: DownloadedBinary;
    if (isPublicTool) {
      try {
        binary = await downloadGitHubBinary(githubProvider, org, repo, version, token);
      } catch (error: any) {
        if (error.message.includes("Authentication failed") || error.status === 401 || error.status === 403) {
          core.warning(`Authenticated access to public repository ${org}/${repo} failed; retrying without token.`);

          // Create a tokenless provider for retry
          const tokenlessConfig: GitHubConfig = {
            baseUrl: "https://github.com",
            apiVersion: "v3",
            token: "",
          };
          const tokenlessProvider = createGitHubProvider(tokenlessConfig);

          binary = await downloadGitHubBinary(tokenlessProvider, org, repo, version, "");
        } else {
          throw error;
        }
      }
    } else {
      binary = await downloadGitHubBinary(githubProvider, org, repo, version, token);
    }

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
  let args = ["report", SKIP_CONTAINER_FLAG];

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
  executeToken: string,
  debug: boolean,
  extra?: { [key: string]: string }
): { [key: string]: string } {
  const telemetryId = `GHAction-${github.context.repo.owner}/${github.context.repo.repo}`;
  // this is a workaround to get the version from the package.json file, since rootDir doesn't contain the package.json file
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const packageJson = require("../package.json");

  const envVars: { [key: string]: string } = {
    ...process.env,
    ...(extra || {}),
    GITHUB_OAUTH_TOKEN: readToken,
    GITHUB_PUBLISH_TOKEN: executeToken,
    PATCHER_TELEMETRY_ID: telemetryId,
    GIT_AUTHOR_NAME: gitCommiter.name,
    GIT_AUTHOR_EMAIL: gitCommiter.email,
    PATCHER_ACTIONS_VERSION: `v${packageJson.version}`,
  };

  if (debug) {
    envVars.PATCHER_LOG_LEVEL = "debug";
    envVars.PATCHER_DEBUG = "1";
    core.info("Debug logging enabled for patcher (PATCHER_LOG_LEVEL=debug, PATCHER_DEBUG=1)");
  }

  return envVars;
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
    executeToken,
    dryRun,
    noColor,
    debug,
  }: PatcherCliArgs,
  extraEnv?: { [key: string]: string }
): Promise<void> {
  switch (command) {
    case REPORT_COMMAND: {
      core.startGroup("Running 'patcher report'");
      const reportOutput = await exec.getExecOutput(
        "patcher",
        reportArgs(specFile, includeDirs, excludeDirs, workingDir, noColor),
        {
          env: getPatcherEnvVars(gitCommiter, readToken, executeToken, debug, extraEnv),
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
          env: getPatcherEnvVars(gitCommiter, readToken, executeToken, debug, extraEnv),
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

async function validateAccessToPatcherCli(githubProvider: GitHubProviderInterface) {
  await githubProvider.validateAccess(PATCHER_ORG, PATCHER_GIT_REPO);
}

export async function run() {
  // Prefer explicit inputs, then fall back to environment variables if present
  const readTokenInput = core.getInput("PIPELINES_READ_TOKEN");
  const executeTokenInput = core.getInput("PIPELINES_EXECUTE_TOKEN");
  const readToken = readTokenInput || process.env.PIPELINES_READ_TOKEN || "";
  const executeToken = executeTokenInput || process.env.PIPELINES_EXECUTE_TOKEN || readToken;

  if (!readToken) {
    throw new Error(
      "Missing token to access required repositories. Provide 'PIPELINES_READ_TOKEN' via the action 'with' inputs or set an environment variable 'PIPELINES_READ_TOKEN'."
    );
  }
  const githubBaseUrl = core.getInput("github_base_url") || "https://github.com";
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
  const debug = core.getBooleanInput("debug");
  const githubOrg = core.getInput("github_org") || "gruntwork-io";
  const extraEnv: { [key: string]: string } = {};
  if (githubBaseUrl) extraEnv.GITHUB_BASE_URL = githubBaseUrl;
  if (githubOrg) extraEnv.GITHUB_ORG = githubOrg;

  // Always mask the token strings in the logs.
  if (readToken) core.setSecret(readToken);
  if (executeToken) core.setSecret(executeToken);

  const githubConfig: GitHubConfig = {
    baseUrl: githubBaseUrl,
    apiVersion: "v3",
    token: readToken,
  };

  const userGitHubProvider = createGitHubProvider(githubConfig);
  core.debug(`Configured github_base_url: ${githubBaseUrl}`);
  core.debug(`Configured github_org: ${githubOrg}`);
  core.debug(`GitHub.com provider fixed baseUrl: https://github.com`);
  const githubComConfig: GitHubConfig = {
    baseUrl: "https://github.com",
    apiVersion: "v3",
    token: readToken,
  };
  const githubComProvider = createGitHubProvider(githubComConfig);

  // Only run the action if the user has access to Patcher. Otherwise, the download won't work.
  await validateAccessToPatcherCli(userGitHubProvider);

  // Validate if the 'patcher_command' provided is valid.
  if (!isPatcherCommandValid(command)) {
    throw new Error(`Invalid Patcher command ${command}`);
  }
  core.info(`Patcher's ${command}' command will be executed.`);

  // Validate if 'commit_author' has a valid format.
  const gitCommiter = parseCommitAuthor(commitAuthor);

  core.startGroup("Downloading Patcher and patch tools");
  await downloadAndSetupTooling(userGitHubProvider, githubComProvider, readToken);
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
    executeToken,
    dryRun,
    noColor,
    debug,
  });
}
