import * as os from "os";

import * as github from "@actions/github";
import * as toolCache from "@actions/tool-cache";
import * as core from "@actions/core";
import * as exec from "@actions/exec";

// Define consts

const GRUNTWORK_GITHUB_ORG = "gruntwork-io";
const PATCHER_GITHUB_REPO = "patcher-cli";
const patcherVersion = "v0.4.3";

const reportCommand = "report";
const updateCommand = "update";

const nonInteractiveFlag = "--non-interactive"
const noColorFlag = "--no-color"
const skipContainerFlag = "--skip-container-runtime"

function osPlatform() {
    switch (os.platform()) {
        case "linux":
            return "linux";
        case "darwin":
            return "darwin";
        default:
            core.setFailed("Unsupported operating system - the Patcher action is only released for Darwin and Linux");
            return;
    }
}

async function openPullRequest(output, dependency, ghToken) {
    const head = `patcher-updates-${dependency}`
    const title = `[Patcher] Update ${dependency}`
    const commitMessage = "Update dependencies using Patcher"
    const commitAuthor = "Grunty"
    const commitEmail = "grunty@gruntwork.io"

    const body = `
Updated the \`${dependency}\` dependency using Patcher.

### Update summary
\`\`\`yaml
${output}
\`\`\`
`

    await exec.exec("git", ["config", "user.name", commitAuthor])
    await exec.exec("git", ["config", "user.email", commitEmail])
    await exec.exec("git", ["add", "."])
    await exec.exec("git", ["commit", "-m", commitMessage])
    await exec.exec("git", ["checkout", "-b", head])

    const context = github.context;

    await exec.exec("git", ["push", "-f", `https://${ghToken}@github.com/${context.repo.owner}/${context.repo.repo}.git`])

    const octokit = new github.getOctokit(ghToken);

    const repoDetails = await octokit.rest.repos.get({ ...context.repo });
    const base = repoDetails.data.default_branch;
    core.debug(`Base branch is ${base}. Opening the PR against it.`)

    try {
        await octokit.rest.pulls.create({ ...context.repo, title, head, base, body, });
    } catch (error) {
        if (error.message?.includes(`A pull request already exists for`)) {
            core.error(`A pull request for ${head} already exists. The branch was updated.`)
        } else {
            throw error
        }
    }
}

async function downloadRelease(owner, repo, tag, ghToken) {
    core.info(`Downloading Patcher version ${patcherVersion}`);

    const octokit = new github.getOctokit(ghToken);

    const getReleaseUrl = await octokit.rest.repos.getReleaseByTag({ owner, repo, tag })

    const re = new RegExp(`${osPlatform()}.*amd64`)
    let asset = getReleaseUrl.data.assets.find(obj => {
        return re.test(obj.name)
    })

    const path =  await toolCache.downloadTool(asset.url,
        undefined,
        `token ${ghToken}`,
        {
            accept: 'application/octet-stream'
        }
    );

    core.debug(`Patcher version '${patcherVersion}' has been downloaded at ${path}`);
    return path
}

function validateCommand(command) {
    switch (command) {
        case "":
        case "update":
            return updateCommand;
        case "report":
            return reportCommand;
        default:
            core.setFailed("Unsupported command - only 'update' and 'report' are supported.");
            return;
    }
}

function updateArgs(updateStrategy, dependency, workingDir) {
    let args = ["update", noColorFlag, nonInteractiveFlag, skipContainerFlag];

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

function getPatcherEnvVars(token) {
    const telemetryId = `GHAction-${github.context.repo.owner}/${github.context.repo.repo}`;

    return {
        "GITHUB_OAUTH_TOKEN": token,
        "PATCHER_TELEMETRY_ID": telemetryId,
        "HOME": "."
    };
}

async function runPatcher(binaryPath, command, {updateStrategy, dependency, patcherWorkingDir, token}) {
    switch(command) {
        case reportCommand:
            core.startGroup("Running 'patcher report'")
            const reportOutput = await exec.getExecOutput(binaryPath,
                [command, nonInteractiveFlag, patcherWorkingDir],
                { env: getPatcherEnvVars(token) });
            core.endGroup()

            core.startGroup("Setting 'dependencies' output")
            core.setOutput("dependencies", reportOutput.stdout)
            core.endGroup()

            return
        default:
            core.startGroup("Running 'patcher update'")
            const updateOutput = await exec.getExecOutput(binaryPath,
                updateArgs(updateStrategy, dependency, patcherWorkingDir),
                { env: getPatcherEnvVars(token) });
            core.endGroup()

            core.startGroup("Opening pull request")
            await openPullRequest(updateOutput.stdout, dependency, token)
            core.endGroup()
    }
}

export async function run() {
    const token = core.getInput("github_token")
    const patcherCommand = core.getInput("patcher_command")
    const updateStrategy = core.getInput("update_strategy")
    const dependency = core.getInput("dependency")
    const patcherWorkingDir = core.getInput("working_dir")

    const command = validateCommand(patcherCommand);

    core.info(`Patcher's ${command}' command will be executed.`);

    core.startGroup("Download Patcher")
    const patcherPath = await downloadRelease(GRUNTWORK_GITHUB_ORG, PATCHER_GITHUB_REPO, patcherVersion, token);
    core.endGroup()

    core.startGroup("Granting permissions to Patcher's binary")
    await exec.exec("chmod", ["+x", patcherPath])
    core.endGroup()

    await runPatcher(patcherPath, command, {updateStrategy, dependency, patcherWorkingDir, token})
}
