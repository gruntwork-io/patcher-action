/**
 * GitHub App authentication provider using OIDC tokens and Gruntwork API
 * Implements token caching, automatic refresh, and secure cleanup
 */

import * as core from "@actions/core";
import { Octokit } from "@octokit/rest";
import {
  AuthenticationProvider,
  AuthProviderType,
  TokenScope,
  GitHubAppConfig,
  RetryConfig,
  CachedToken,
  GitHubTokenResponse,
  AuthenticationError,
  AuthErrorCode,
} from "./interfaces";

export class GitHubAppProvider implements AuthenticationProvider {
  private readonly config: GitHubAppConfig;
  private readonly retryConfig: RetryConfig;
  private readonly tokenCache: Map<string, CachedToken> = new Map(); // Cache by token path instead of scope

  constructor(config: GitHubAppConfig, retryConfig: RetryConfig) {
    this.config = config;
    this.retryConfig = retryConfig;
  }

  async getToken(scope: TokenScope): Promise<string> {
    const tokenPath = this.getTokenPath(scope);
    const cachedToken = this.tokenCache.get(tokenPath);

    // Return cached token if valid and not near expiration
    if (cachedToken && this.isTokenValid(cachedToken)) {
      core.debug(`Using cached GitHub App token for scope: ${scope} (path: ${tokenPath})`);
      return cachedToken.token;
    }

    // Fetch new token
    core.debug(`Fetching new GitHub App token for scope: ${scope} (path: ${tokenPath})`);
    const newToken = await this.fetchToken(scope);

    // Cache the token by path (so multiple scopes can share the same token)
    this.tokenCache.set(tokenPath, newToken);

    // Mask the token immediately for security
    core.setSecret(newToken.token);

    return newToken.token;
  }

  async validateAccess(owner: string, repo: string): Promise<void> {
    try {
      const token = await this.getToken(TokenScope.READ);
      const octokit = new Octokit({
        auth: token,
        baseUrl: this.getGitHubApiUrl(),
      });

      await octokit.rest.repos.get({ owner, repo });
      core.debug(`GitHub App access validated for ${owner}/${repo}`);
    } catch (error: any) {
      throw new AuthenticationError(
        `GitHub App access validation failed for ${owner}/${repo}: ${error.message}`,
        this.mapErrorCode(error),
        "github-app",
        TokenScope.READ,
        this.isRetryableError(error)
      );
    }
  }

  getTokenType(): AuthProviderType {
    return "github-app";
  }

  async isHealthy(): Promise<boolean> {
    try {
      // Check if we can get an OIDC token
      const idToken = await core.getIDToken(this.config.audience);
      if (!idToken) {
        return false;
      }

      // Verify API connectivity with a lightweight call
      const response = await fetch(`${this.config.apiBaseUrl}/health`, {
        method: "GET",
        headers: {
          "User-Agent": "patcher-action-github-app-provider/1.0",
        },
      });

      return response.ok;
    } catch (error) {
      // Sanitize error message to prevent token exposure
      const sanitizedError = this.sanitizeErrorMessage(String(error));
      core.debug(`GitHub App health check failed: ${sanitizedError}`);
      return false;
    }
  }

  dispose(): void {
    // Securely clear cached tokens
    for (const [, cachedToken] of this.tokenCache) {
      // Clear token from memory
      cachedToken.token = "";
    }
    this.tokenCache.clear();
    core.debug("GitHub App provider disposed and tokens cleared");
  }

  private async fetchToken(scope: TokenScope): Promise<CachedToken> {
    const tokenPath = this.getTokenPath(scope);

    return await this.withRetry(async () => {
      // Get OIDC token from GitHub Actions
      const idToken = await core.getIDToken(this.config.audience);
      if (!idToken) {
        throw new AuthenticationError(
          "Failed to obtain OIDC token from GitHub Actions",
          AuthErrorCode.TOKEN_UNAVAILABLE,
          "github-app",
          scope,
          false
        );
      }

      // Get provider token from Gruntwork API
      const providerToken = await this.getProviderToken(idToken);

      // Get GitHub token using provider token
      const githubToken = await this.getGitHubToken(providerToken, tokenPath);

      return {
        token: githubToken.token,
        expiresAt: new Date(Date.now() + githubToken.expires_in * 1000),
        scope,
      };
    });
  }

  private async getProviderToken(idToken: string): Promise<string> {
    const response = await fetch(`${this.config.apiBaseUrl}/tokens/auth/login`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
        "User-Agent": "patcher-action-github-app-provider/1.0",
      },
    });

    if (!response.ok) {
      // Sanitize error message to avoid exposing sensitive tokens
      const sanitizedStatusText = this.sanitizeErrorMessage(response.statusText);
      throw new AuthenticationError(
        `Provider token request failed: ${response.status} ${sanitizedStatusText}`,
        this.mapHttpStatusToErrorCode(response.status),
        "github-app",
        undefined,
        response.status >= 500 || response.status === 429
      );
    }

    const data = await response.json();
    if (!data.token) {
      throw new AuthenticationError(
        "Provider token response missing token field",
        AuthErrorCode.TOKEN_UNAVAILABLE,
        "github-app",
        undefined,
        false
      );
    }

    return data.token;
  }

  private async getGitHubToken(providerToken: string, tokenPath: string): Promise<GitHubTokenResponse> {
    const response = await fetch(`${this.config.apiBaseUrl}/tokens/pat/${tokenPath}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${providerToken}`,
        Accept: "application/json",
        "User-Agent": "patcher-action-github-app-provider/1.0",
      },
    });

    if (!response.ok) {
      // Sanitize error message to avoid exposing sensitive tokens
      const sanitizedStatusText = this.sanitizeErrorMessage(response.statusText);
      throw new AuthenticationError(
        `GitHub token request failed: ${response.status} ${sanitizedStatusText}`,
        this.mapHttpStatusToErrorCode(response.status),
        "github-app",
        undefined,
        response.status >= 500 || response.status === 429
      );
    }

    const data = await response.json();
    if (!data.token) {
      throw new AuthenticationError(
        "GitHub token response missing token field",
        AuthErrorCode.TOKEN_UNAVAILABLE,
        "github-app",
        undefined,
        false
      );
    }

    return {
      token: data.token,
      expires_in: data.expires_in || 3600, // Default to 1 hour
    };
  }

  private getTokenPath(scope: TokenScope): string {
    switch (scope) {
      case TokenScope.READ:
      case TokenScope.DOWNLOAD:
      case TokenScope.ADMIN:
        return this.config.tokenPaths.read;
      case TokenScope.WRITE:
        return this.config.tokenPaths.write;
      default:
        return this.config.tokenPaths.read;
    }
  }

  private isTokenValid(cachedToken: CachedToken): boolean {
    const now = new Date();
    const bufferMs = 5 * 60 * 1000; // 5 minute buffer
    return cachedToken.expiresAt.getTime() > now.getTime() + bufferMs;
  }

  private getGitHubApiUrl(): string {
    return this.config.githubBaseUrl === "https://github.com"
      ? "https://api.github.com"
      : `${this.config.githubBaseUrl}/api/v3`;
  }

  private mapErrorCode(error: any): AuthErrorCode {
    const status = error.status || error.code;
    return this.mapHttpStatusToErrorCode(status);
  }

  private mapHttpStatusToErrorCode(status: number): AuthErrorCode {
    switch (status) {
      case 401:
        return AuthErrorCode.INVALID_CREDENTIALS;
      case 403:
        return AuthErrorCode.INSUFFICIENT_PERMISSIONS;
      case 429:
        return AuthErrorCode.RATE_LIMITED;
      case 404:
        return AuthErrorCode.TOKEN_UNAVAILABLE;
      default:
        return AuthErrorCode.NETWORK_ERROR;
    }
  }

  private isRetryableError(error: any): boolean {
    // Check if it's an AuthenticationError with retryable flag
    if (error instanceof AuthenticationError) {
      return error.retryable;
    }

    // For other errors, check HTTP status codes
    const status = error.status || error.code;
    return status >= 500 || status === 429 || status === 408;
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        if (attempt === this.retryConfig.maxAttempts || !this.isRetryableError(error)) {
          break;
        }

        const delay = Math.min(
          this.retryConfig.baseDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
          this.retryConfig.maxDelayMs
        );

        core.debug(`GitHub App token fetch attempt ${attempt} failed, retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Sanitize error messages to prevent sensitive token exposure
   * Removes or masks potential tokens, secrets, and sensitive data
   */
  private sanitizeErrorMessage(message: string): string {
    if (!message) return "Unknown error";

    // Pattern to match potential tokens and sensitive data
    const sensitivePatterns = [
      // JWT tokens (eyJ...)
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      // GitHub tokens (ghp_, gho_, ghs_, ghr_, github_pat_)
      /gh[poshru]_[A-Za-z0-9_]+/g,
      /github_pat_[A-Za-z0-9_]+/g,
      // Generic secrets and tokens
      /(?:token|secret|key|password|credential)[:\s=]+[A-Za-z0-9_-]+/gi,
      // Bearer tokens
      /Bearer\s+[A-Za-z0-9._-]+/gi,
      // Base64 encoded data that might be sensitive
      /[A-Za-z0-9+/]{20,}={0,2}/g,
    ];

    let sanitized = message;

    // Replace sensitive patterns with [REDACTED]
    sensitivePatterns.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, "[REDACTED]");
    });

    // Additional specific sanitization for common error patterns
    sanitized = sanitized.replace(/Invalid OIDC token: [^\s]+/gi, "Invalid OIDC token: [REDACTED]");
    sanitized = sanitized.replace(
      /Authentication failed with token [^\s]+/gi,
      "Authentication failed with token [REDACTED]"
    );

    return sanitized;
  }
}
