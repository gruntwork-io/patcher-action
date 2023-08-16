import * as childProcess from "child_process";

import * as github from "@actions/github";
import * as core from "@actions/core";
import * as exec from "@actions/exec";

import {gruntworkOrg, nonInteractiveFlag, noColorFlag, patcherRepo, patcherVersion, reportCommand, updateCommand} from "./consts";
import { downloadRelease, openPullRequest } from "./github";
import {getExecOutput} from "@actions/exec";

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

function flags(command, updateStrategy, dependency) {
    let updateFlags = `${noColorFlag} ${nonInteractiveFlag}`;
    if (updateStrategy !== "") {
        updateFlags = updateFlags.concat(` --update-strategy ${updateStrategy}`)
    }

    if (dependency !== "" && command === updateCommand) {
        updateFlags = updateFlags.concat(` --target ${dependency}`)
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

function processUpdate(output, dependency, ghToken) {

    openPullRequest(output, dependency, ghToken)
}

export async function run() {
    core.info(`Actor is: ${github.context.actor}`)
    const ghToken = core.getInput("github_token")
    const patcherCommand = core.getInput("patcher_command")
    const updateStrategy = core.getInput("update_strategy")

    const dependency = core.getInput("dependency")
    core.info(`DEPENDENCY: ${dependency}`)

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
    await exec.exec("chmod", ["+x", cachedPath])
    // await exec.exec("export", "PATCHER_TOKEN", "Gruntwork-marina-action")

    const output = childProcess.execSync(`GITHUB_OAUTH_TOKEN=${ghToken} ${cachedPath} ${command} ${flags(command, updateStrategy, dependency)} ${folder}`).toString()
    // const args = [command].concat(flags(command, updateStrategy, dependency)).concat([folder])
    // const output = await exec.getExecOutput(cachedPath, args, {
    //         env: {
    //             "HOME": ".",
    //             "PATCHER_TOKEN": "",
    //             "GITHUB_OAUTH_TOKEN": ghToken
    //         }
    //     });
    // const result = output.stdout

    core.endGroup()

    if (command === reportCommand) {
        return processReport(output)
    }

    processUpdate(output, dependency, ghToken)
}
