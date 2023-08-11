import * as core from '@actions/core'

import * as toolCache from '@actions/tool-cache';

function formatDownloadUrl(version: string): string {
    return `https://github.com/gruntwork-io/patcher-cli/releases/download/${version}/patcher_linux_amd64`;
}

async function downloadPatcher(version: string, ghToken: string): Promise<string>{
    const url = formatDownloadUrl(version);
    return await toolCache.downloadTool(url, undefined, `token ${ghToken}`);
}

export async function run() {
    const ghToken = core.getInput("GITHUB_TOKEN")
    const patcherVersion = "v0.4.3";

    const cachedPath = await downloadPatcher(patcherVersion, ghToken);

    core.info(
        `[INFO] Patcher version: '${patcherVersion}' has been cached at ${cachedPath}`
    );
}
