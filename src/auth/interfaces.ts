/**
 * Authentication interfaces and types for GitHub App and PAT integration
 * Based on the approved Authentication Abstraction Layer Technical Specification
 */

/**
 * Token scopes for different operation types
 */
export enum TokenScope {
  /**
   * Read-only operations: repository access, release fetching, dependency analysis
   */
  READ = "read",

  /**
   * Write operations: creating PRs, updating branches, publishing changes
   */
  WRITE = "write",

  /**
   * Binary download operations: asset downloads, tool installations
   */
  DOWNLOAD = "download",

  /**
   * Administrative operations: repository validation, organization access
   */
  ADMIN = "admin",
}

/**
 * Authentication provider types
 */
export type AuthProviderType = "github-app" | "pat" | "hybrid";

/**
 * Authentication error codes
 */
export enum AuthErrorCode {
  TOKEN_UNAVAILABLE = "TOKEN_UNAVAILABLE",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS",
  NETWORK_ERROR = "NETWORK_ERROR",
  RATE_LIMITED = "RATE_LIMITED",
  PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE",
}

/**
 * Authentication errors with context
 */
export class AuthenticationError extends Error {
  constructor(
    message: string,
    public readonly code: AuthErrorCode,
    public readonly providerType: AuthProviderType,
    public readonly scope?: TokenScope,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}

/**
 * Unified interface for authentication providers
 */
export interface AuthenticationProvider {
  /**
   * Get an authentication token for the specified scope
   * @param scope - The scope of operations the token will be used for
   * @returns Promise<string> - The authentication token
   * @throws AuthenticationError when token cannot be obtained
   */
  getToken(scope: TokenScope): Promise<string>;

  /**
   * Validate access to a specific repository
   * @param owner - Repository owner
   * @param repo - Repository name
   * @returns Promise<void> - Resolves if access is valid
   * @throws AuthenticationError when access validation fails
   */
  validateAccess(owner: string, repo: string): Promise<void>;

  /**
   * Get the type of authentication provider
   * @returns The provider type for logging and telemetry
   */
  getTokenType(): AuthProviderType;

  /**
   * Check if the provider is healthy and can provide tokens
   * @returns Promise<boolean> - true if provider is healthy
   */
  isHealthy(): Promise<boolean>;

  /**
   * Clean up resources and cached tokens
   */
  dispose(): void;
}

/**
 * Configuration for the authentication manager
 */
export interface AuthManagerConfig {
  githubAppConfig: GitHubAppConfig;
  patConfig: PATConfig;
  retryConfig: RetryConfig;
}

/**
 * GitHub App configuration
 */
export interface GitHubAppConfig {
  enabled: boolean;
  apiBaseUrl: string;
  audience: string;
  githubBaseUrl: string;
  tokenPaths: {
    read: string;
    write: string;
  };
  cacheConfig: {
    ttlSeconds: number;
    maxSize: number;
  };
}

/**
 * PAT configuration
 */
export interface PATConfig {
  githubToken: string;
  readToken?: string;
  updateToken?: string;
  githubBaseUrl: string;
  githubOrg: string;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Cached token structure
 */
export interface CachedToken {
  token: string;
  expiresAt: Date;
  scope: TokenScope;
}

/**
 * GitHub token response from Gruntwork API
 */
export interface GitHubTokenResponse {
  token: string;
  expires_in: number;
}
