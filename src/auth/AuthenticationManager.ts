/**
 * Central authentication manager that orchestrates provider selection and fallback
 * Implements the authentication abstraction layer with automatic provider selection
 */

import * as core from "@actions/core";
import {
  AuthenticationProvider,
  AuthManagerConfig,
  TokenScope,
  AuthenticationError,
  AuthErrorCode,
  AuthProviderType,
} from "./interfaces";
import { GitHubAppProvider } from "./GitHubAppProvider";
import { PATProvider } from "./PATProvider";

export class AuthenticationManager {
  private readonly githubAppProvider?: GitHubAppProvider;
  private readonly patProvider: PATProvider;
  private readonly config: AuthManagerConfig;
  private currentProvider?: AuthenticationProvider;

  constructor(config: AuthManagerConfig) {
    this.config = config;

    // Always create PAT provider as fallback
    this.patProvider = new PATProvider(config.patConfig);

    // Create GitHub App provider only if enabled
    if (config.githubAppConfig.enabled) {
      this.githubAppProvider = new GitHubAppProvider(config.githubAppConfig, config.retryConfig);
    }
  }

  /**
   * Get the appropriate authentication provider based on availability and health
   */
  async getProvider(): Promise<AuthenticationProvider> {
    // Return cached provider if still healthy
    if (this.currentProvider && (await this.currentProvider.isHealthy())) {
      return this.currentProvider;
    }

    // Try GitHub App first if enabled
    if (this.githubAppProvider && this.config.githubAppConfig.enabled) {
      try {
        const isHealthy = await this.githubAppProvider.isHealthy();
        if (isHealthy) {
          core.info("✓ Using GitHub App authentication");
          this.currentProvider = this.githubAppProvider;
          return this.githubAppProvider;
        } else {
          // Log warning when GitHub App is unhealthy
          core.warning("⚠️ GitHub App authentication unavailable: Health check failed");
          this.logFallbackEvent("github-app-unhealthy");
        }
      } catch (error: any) {
        core.warning(`⚠️ GitHub App authentication unavailable: ${error.message}`);
        this.logFallbackEvent("github-app-unhealthy", error);
      }
    }

    // Fallback to PAT
    const isPATHealthy = await this.patProvider.isHealthy();
    if (isPATHealthy) {
      const fallbackMessage = this.githubAppProvider
        ? "✓ Using PAT authentication (fallback from GitHub App)"
        : "✓ Using PAT authentication";
      core.info(fallbackMessage);
      this.currentProvider = this.patProvider;
      return this.patProvider;
    }

    // No healthy providers available
    throw new AuthenticationError(
      "No healthy authentication providers available",
      AuthErrorCode.PROVIDER_UNAVAILABLE,
      "hybrid",
      undefined,
      false
    );
  }

  /**
   * Get a token for a specific scope, with automatic provider selection
   */
  async getToken(scope: TokenScope): Promise<string> {
    const startTime = Date.now();
    try {
      const provider = await this.getProvider();
      const token = await provider.getToken(scope);

      this.logAuthenticationTelemetry(provider.getTokenType(), scope, "success", Date.now() - startTime);
      return token;
    } catch (error: any) {
      this.logAuthenticationTelemetry("unknown", scope, "failed", Date.now() - startTime, error);
      throw error;
    }
  }

  /**
   * Validate access using the best available provider
   */
  async validateAccess(owner: string, repo: string): Promise<void> {
    const provider = await this.getProvider();
    await provider.validateAccess(owner, repo);
  }

  /**
   * Get the current provider type for telemetry
   */
  async getProviderType(): Promise<AuthProviderType> {
    const provider = await this.getProvider();
    return provider.getTokenType();
  }

  /**
   * Clean up all providers
   */
  dispose(): void {
    this.githubAppProvider?.dispose();
    this.patProvider.dispose();
    this.currentProvider = undefined;
    core.debug("Authentication manager disposed");
  }

  private logFallbackEvent(reason: string, error?: Error): void {
    core.info(`Authentication fallback: ${reason}`);
    if (error) {
      core.debug(`Fallback error details: ${error.message}`);
    }

    // Structured telemetry for monitoring (no sensitive data)
    core.debug(
      `::auth-fallback::${JSON.stringify({
        reason,
        error_type: error?.constructor.name || "unknown",
        timestamp: new Date().toISOString(),
      })}`
    );
  }

  private logAuthenticationTelemetry(
    provider: AuthProviderType | "unknown",
    scope: TokenScope,
    status: "success" | "failed",
    durationMs: number,
    error?: Error
  ): void {
    if (status === "success") {
      core.debug(`Token acquisition: ${provider}/${scope} ${status} (${durationMs}ms)`);
    } else {
      core.debug(
        `Token acquisition: ${provider}/${scope} ${status} (${durationMs}ms) - ${error?.message || "unknown error"}`
      );
    }

    // Structured telemetry for external monitoring (no sensitive data)
    core.debug(
      `::auth-telemetry::${JSON.stringify({
        event: "token_acquisition",
        provider,
        scope,
        status,
        duration_ms: durationMs,
        error_type: error?.constructor.name,
        timestamp: new Date().toISOString(),
      })}`
    );
  }
}
