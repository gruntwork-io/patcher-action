import * as childProcess from "child_process";

import * as github from "@actions/github";
import * as core from "@actions/core";
import * as yaml from "js-yaml"

import {gruntworkOrg, nonInteractiveFlag, noColorFlag, patcherRepo, patcherVersion, reportCommand, updateCommand} from "./consts";
import { downloadRelease, openPullRequest } from "./github";

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

function flags(command, updateStrategy) {
    let updateFlags = `${noColorFlag} ${nonInteractiveFlag}`;
    if (updateStrategy !== "") {
        updateFlags = updateFlags.concat(` --update-strategy ${updateStrategy}`)
    }
    switch (command) {
        case updateCommand:
            return updateFlags;
        case reportCommand:
            return nonInteractiveFlag;
    }
}

function processReport(output) {
    core.setOutput("dependencies", output)
}

function processUpdate(output, ghToken) {
    // const yamlOutput = yaml.load(output);
    // core.debug(yamlOutput)

    openPullRequest(output, ghToken)
}

export async function run() {
    core.info(`Actor is: ${github.context.actor}`)
    const ghToken = core.getInput("github_token")
    const patcherCommand = core.getInput("patcher_command")
    const updateStrategy = core.getInput("update_strategy")

    // TODO better name
    const folder = core.getInput("folder")


    const command = validateCommand(patcherCommand);
    core.info(`Patcher's ${command}' command will be executed.`);

    core.startGroup("Download Patcher")
    core.info(`Downloading Patcher version ${patcherVersion}`);
    const cachedPath = await downloadRelease(gruntworkOrg, patcherRepo, patcherVersion, ghToken);

    core.debug(`Patcher version '${patcherVersion}' has been downloaded at ${cachedPath}`);
    core.endGroup()


    core.startGroup("Run Patcher")
    // TODO replace with https://github.com/actions/toolkit/tree/master/packages/exec
    childProcess.execSync(`chmod +x ${cachedPath}`)

    childProcess.execSync("export PATCHER_TOKEN=Gruntwork-marina-action")

    const output = childProcess.execSync(`GITHUB_OAUTH_TOKEN=${ghToken} ${cachedPath} ${command} ${flags(command, updateStrategy)} ${folder}`).toString()

    core.endGroup()

    if (command === reportCommand) {
        return processReport(output)
    }

    processUpdate(output, ghToken)

    // core.info(childProcess.execSync("git diff").toString())
    // git commit, push changes with the hash.
    // push the branch with git.
}
