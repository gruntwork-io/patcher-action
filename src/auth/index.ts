/**
 * Authentication module exports
 * Central export point for all authentication-related functionality
 */

export { AuthenticationManager } from "./AuthenticationManager";
export { GitHubAppProvider } from "./GitHubAppProvider";
export { PATProvider } from "./PATProvider";
export { parseAuthenticationConfig } from "./ConfigParser";
export { AuthenticatedGitHubProvider, createAuthenticatedGitHubProvider } from "./AuthenticatedGitHubProvider";

export {
  AuthenticationProvider,
  AuthManagerConfig,
  GitHubAppConfig,
  PATConfig,
  RetryConfig,
  TokenScope,
  AuthProviderType,
  AuthErrorCode,
  AuthenticationError,
  CachedToken,
  GitHubTokenResponse,
} from "./interfaces";
