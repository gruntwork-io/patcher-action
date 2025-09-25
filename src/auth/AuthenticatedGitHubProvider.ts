/**
 * Enhanced GitHub provider that uses authentication manager for token management
 * Maintains compatibility with existing GitHubProviderInterface while adding auth abstraction
 */

import * as core from "@actions/core";
import { Octokit } from "@octokit/rest";
import { AuthenticationManager, TokenScope } from "./index";

// Import the existing interfaces from the main action file
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

interface GitHubConfig {
  baseUrl: string;
  apiVersion: string;
  token: string;
}

/**
 * Enhanced GitHub provider that uses authentication manager
 */
export class AuthenticatedGitHubProvider implements GitHubProviderInterface {
  private octokit: Octokit;
  private authManager: AuthenticationManager;
  private baseUrl: string;

  constructor(config: GitHubConfig, authManager: AuthenticationManager) {
    this.authManager = authManager;
    this.baseUrl =
      config.baseUrl === "https://github.com" ? "https://api.github.com" : `${config.baseUrl}/api/${config.apiVersion}`;
    this.octokit = new Octokit({
      auth: config.token,
      baseUrl: this.baseUrl,
    });
  }

  async getReleaseByTag(owner: string, repo: string, tag: string): Promise<Release> {
    try {
      // Ensure we have a fresh token for this operation
      const token = await this.authManager.getToken(TokenScope.READ);
      this.updateOctokitAuth(token);

      const response = await this.octokit.rest.repos.getReleaseByTag({
        owner,
        repo,
        tag,
      });
      return response.data;
    } catch (error: any) {
      // Preserve existing error handling logic for backward compatibility
      if (error.status === 404) {
        throw new Error(
          `Release '${tag}' not found in repository '${owner}/${repo}'. Please check the repository exists and the tag is correct.`
        );
      } else if (error.status === 401 || error.status === 403) {
        const providerType = await this.authManager.getProviderType();
        throw new Error(
          `Authentication failed when accessing '${owner}/${repo}' using ${providerType} authentication. Please check your token permissions.`
        );
      } else {
        throw error;
      }
    }
  }

  async validateAccess(owner: string, repo: string): Promise<void> {
    // Delegate to authentication manager for provider-specific validation
    await this.authManager.validateAccess(owner, repo);
  }

  private updateOctokitAuth(token: string): void {
    this.octokit = new Octokit({
      auth: token,
      baseUrl: this.baseUrl,
    });
  }
}

/**
 * Factory function to create authenticated GitHub providers
 */
export async function createAuthenticatedGitHubProvider(
  authManager: AuthenticationManager,
  baseUrl: string
): Promise<AuthenticatedGitHubProvider> {
  const token = await authManager.getToken(TokenScope.READ);
  const providerType = await authManager.getProviderType();

  core.info(`Using ${providerType} authentication for GitHub operations`);

  const config: GitHubConfig = {
    baseUrl,
    apiVersion: "v3",
    token,
  };

  return new AuthenticatedGitHubProvider(config, authManager);
}
