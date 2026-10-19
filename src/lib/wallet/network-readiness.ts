import type { CoreNodeConfig } from './contracts';

// Mobile cannot use a desktop's loopback Core or its local cookie file.
// Native configuration validation still owns URL, TLS/Tor and credential checks.
export function requiresMobileNodeSetup(config: CoreNodeConfig | null): boolean {
  return (
    !config ||
    config.backend.type !== 'remote_core' ||
    config.auth !== 'user_pass' ||
    !config.backend.url.trim() ||
    !config.username?.trim()
  );
}
