import os from "os";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import * as toolCache from "@actions/tool-cache";

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

export async function openPullRequest(output, ghtoken) {
    const head = "patcher-updates"
    const title = "[Patcher] Update"

    const body = ` Updated dependencies. ${output} `

    const commitMessage = "Update dependencies using Patcher"
    const commitAuthor = "Marina <marina@gruntwork.io>"
    const commitEmail = "grunty@gruntwork.io"

    await exec.exec("git", ["config", "user.name", commitAuthor])
    await exec.exec("git", ["config", "user.email", commitEmail])
    await exec.exec("git", ["add", "."])
    await exec.exec("git", ["commit", "-m", commitMessage])
    await exec.exec("git", ["checkout", "-b", head])

//     ('git rev-parse HEAD')
// .toString().trim()

    const context = github.context;

    core.info(`Context is ${context.repo.owner}, ${context.repo.repo}`)

    // await exec.exec("git", ["push", "origin", head])

    await exec.exec("git", ["push", `https://${ghtoken}@github.com/${context.repo.owner}/${context.repo.repo}.git`])


    const result = await octokit.rest.pulls.create({ ...context.repo, title, head, base: 'master', body, });
    core.info(result)
}

export async function downloadRelease(owner, repo, tag, ghToken) {
    const octokit = new github.getOctokit(ghToken);

    const getReleaseUrl = await octokit.rest.repos.getReleaseByTag({ owner, repo, tag})

    const re = new RegExp(`${osPlatform()}.*amd64`)
    let asset = getReleaseUrl.data.assets.find(obj => {
        return re.test(obj.name)
    })

    const url = asset.url;
    return await toolCache.downloadTool(url,
        undefined,
        `token ${ghToken}`,
        {
            accept: 'application/octet-stream'
        }
    );

}