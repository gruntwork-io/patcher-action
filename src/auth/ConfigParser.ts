/**
 * Parse action inputs into authentication configuration
 * Handles both existing PAT inputs and new GitHub App inputs
 */

import * as core from "@actions/core";
import { AuthManagerConfig } from "./interfaces";

/**
 * Parse action inputs into authentication configuration
 * Ensures backward compatibility while adding GitHub App support
 */
export function parseAuthenticationConfig(): AuthManagerConfig {
  // Legacy PAT inputs (unchanged for backward compatibility)
  const githubToken = core.getInput("github_token");
  const readToken = core.getInput("read_token");
  const updateToken = core.getInput("update_token");
  const githubBaseUrl = core.getInput("github_base_url") || "https://github.com";
  const githubOrg = core.getInput("github_org") || "gruntwork-io";

  // New GitHub App inputs
  const enableGithubApp = core.getBooleanInput("enable_github_app");
  const githubAppTokenPath = core.getInput("github_app_token_path");
  const githubAppWriteTokenPath = core.getInput("github_app_write_token_path");
  const gruntworkApiBaseUrl = core.getInput("gruntwork_api_base_url");

  // github_token is now optional - if not provided and GitHub App is down, action will fail

  const config: AuthManagerConfig = {
    githubAppConfig: {
      enabled: enableGithubApp,
      apiBaseUrl: gruntworkApiBaseUrl || "https://api.prod.app.gruntwork.io",
      audience: "https://api.prod.app.gruntwork.io",
      githubBaseUrl,
      tokenPaths: {
        read: githubAppTokenPath || "patcher-read/gruntwork-io",
        write: githubAppWriteTokenPath || "patcher-write/gruntwork-io",
      },
      cacheConfig: {
        ttlSeconds: 3600, // 1 hour
        maxSize: 10,
      },
    },
    patConfig: {
      githubToken,
      readToken,
      updateToken,
      githubBaseUrl,
      githubOrg,
    },
    retryConfig: {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
    },
  };

  // Validate configuration
  validateAuthenticationConfig(config);

  return config;
}

/**
 * Comprehensive configuration validation
 */
function validateAuthenticationConfig(config: AuthManagerConfig): void {
  // github_token is now optional - validation removed to allow failing when no auth available

  // Validate GitHub App configuration if enabled
  if (config.githubAppConfig.enabled) {
    const rawApiBaseUrl = core.getInput("gruntwork_api_base_url");
    const rawTokenPath = core.getInput("github_app_token_path");

    if (!rawApiBaseUrl) {
      throw new Error("gruntwork_api_base_url is required when GitHub App authentication is enabled");
    }

    if (!rawTokenPath) {
      throw new Error("github_app_token_path is required when GitHub App authentication is enabled");
    }

    // Validate API URL format and security
    validateSecureUrl(rawApiBaseUrl, "gruntwork_api_base_url");

    if (!config.githubAppConfig.audience) {
      throw new Error("GitHub App audience is required");
    }
  }

  // Validate GitHub base URL
  const rawGithubBaseUrl = core.getInput("github_base_url");
  if (rawGithubBaseUrl) {
    validateSecureUrl(rawGithubBaseUrl, "github_base_url");
  }

  core.debug("Authentication configuration validation passed");
}

/**
 * Validate URL format and security to prevent injection attacks
 */
function validateSecureUrl(urlString: string, parameterName: string): void {
  // First check for dangerous protocols before trying to parse as URL
  const dangerousProtocols = ["javascript:", "data:", "file:", "ftp:", "ldap:", "gopher:"];
  if (dangerousProtocols.some((protocol) => urlString.toLowerCase().startsWith(protocol))) {
    throw new Error(`${parameterName} must be a valid URL`);
  }

  try {
    const url = new URL(urlString);

    // Basic hostname validation to prevent obvious malicious URLs
    if (!url.hostname || url.hostname.length < 1) {
      throw new Error(`${parameterName} must be a valid URL`);
    }

    // Only allow HTTPS URLs for security (except for localhost development)
    const allowedProtocols = ["https:"];
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      allowedProtocols.push("http:");
    }

    if (!allowedProtocols.includes(url.protocol)) {
      throw new Error(`${parameterName} must use HTTPS protocol (or HTTP for localhost)`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes(parameterName)) {
      throw error; // Re-throw our custom validation errors
    }
    throw new Error(`${parameterName} must be a valid URL`);
  }
}
