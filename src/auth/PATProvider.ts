/**
 * Personal Access Token authentication provider with backward compatibility
 * Preserves existing token hierarchy and error handling behavior
 */

import * as core from "@actions/core";
import { Octokit } from "@octokit/rest";
import {
  AuthenticationProvider,
  AuthProviderType,
  TokenScope,
  PATConfig,
  AuthenticationError,
  AuthErrorCode,
} from "./interfaces";

export class PATProvider implements AuthenticationProvider {
  private readonly config: PATConfig;

  constructor(config: PATConfig) {
    this.config = config;

    // Mask all tokens immediately upon construction
    if (config.githubToken) core.setSecret(config.githubToken);
    if (config.readToken) core.setSecret(config.readToken);
    if (config.updateToken) core.setSecret(config.updateToken);
  }

  async getToken(scope: TokenScope): Promise<string> {
    let token: string;

    // Preserve existing token hierarchy logic exactly
    switch (scope) {
      case TokenScope.READ:
      case TokenScope.DOWNLOAD:
      case TokenScope.ADMIN:
        token = this.config.readToken || this.config.githubToken;
        break;
      case TokenScope.WRITE:
        token = this.config.updateToken || this.config.githubToken;
        break;
      default:
        token = this.config.githubToken;
    }

    if (!token) {
      throw new AuthenticationError(
        `No PAT available for scope: ${scope}`,
        AuthErrorCode.TOKEN_UNAVAILABLE,
        "pat",
        scope,
        false
      );
    }

    return token;
  }

  async validateAccess(owner: string, repo: string): Promise<void> {
    try {
      const token = await this.getToken(TokenScope.READ);
      const octokit = new Octokit({
        auth: token,
        baseUrl: this.getGitHubApiUrl(),
      });

      await octokit.rest.repos.get({ owner, repo });
      core.debug(`PAT access validated for ${owner}/${repo}`);
    } catch (error: any) {
      // Preserve existing error messages exactly for backward compatibility
      if (error.status === 404 || error.message.includes("Not Found")) {
        if (owner !== "gruntwork-io") {
          core.warning(
            `Cannot validate access to '${owner}/${repo}' repository. This may be due to token permissions or repository visibility. Proceeding with download attempt.`
          );
          return;
        }
        throw new Error(
          `Cannot access the '${repo}' repository. This could indicate: 1) The repository doesn't exist, 2) Your token doesn't have access to this repository, or 3) Your token lacks the 'repo' scope for private repositories. Please check your token permissions and repository access. If you continue to have issues and are a Gruntwork customer, contact support@gruntwork.io.`
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

  getTokenType(): AuthProviderType {
    return "pat";
  }

  async isHealthy(): Promise<boolean> {
    // PAT is healthy if we have a github_token
    return !!this.config.githubToken;
  }

  dispose(): void {
    // No resources to clean up for PAT provider
  }

  private getGitHubApiUrl(): string {
    return this.config.githubBaseUrl === "https://github.com"
      ? "https://api.github.com"
      : `${this.config.githubBaseUrl}/api/v3`;
  }
}
