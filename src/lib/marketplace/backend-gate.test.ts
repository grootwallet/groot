import { describe, expect, it } from 'vitest';
import {
  marketplaceBackendEnabled,
  marketplaceBackendPort,
  marketplaceSandboxBuildEnabled
} from '../../../scripts/dev/marketplace-backend';

describe('marketplace service development boundary', () => {
  it('enables a static sandbox only in its named non-native build, independently of development flags', () => {
    for (const command of ['serve', 'build'] as const)
      for (const mode of [undefined, 'production', 'regtest', 'mainnet', 'marketplace-sandbox'])
        for (const nativePlatform of [undefined, 'ios', 'macos', 'android'])
          for (const flag of [undefined, '0', 'true', '1'])
            expect(marketplaceSandboxBuildEnabled({ command, mode, nativePlatform, flag })).toBe(
              command === 'build' &&
                mode === 'marketplace-sandbox' &&
                !nativePlatform &&
                flag === '1'
            );
  });
  it('permits only explicit non-native development; build and preview flags cannot enable it', () => {
    for (const command of ['serve', 'build'] as const)
      for (const isPreview of [false, true])
        for (const nativePlatform of [undefined, 'ios', 'macos', 'android'])
          for (const flag of [undefined, '0', 'true', '1'])
            expect(marketplaceBackendEnabled({ command, isPreview, nativePlatform, flag })).toBe(
              command === 'serve' && !isPreview && !nativePlatform && flag === '1'
            );
  });
  it.each([
    '0',
    '80',
    '1023',
    '65536',
    '5200/evil',
    'http://evil',
    ' 5200',
    '5200.1',
    '05200',
    '5200\n'
  ])('rejects unsafe proxy port %j', (value) => {
    expect(() => marketplaceBackendPort(value)).toThrow();
  });
  it('uses numeric loopback port configuration with bounded inclusive limits', () => {
    expect(marketplaceBackendPort()).toBe(5200);
    expect(marketplaceBackendPort('1024')).toBe(1024);
    expect(marketplaceBackendPort('65535')).toBe(65535);
  });
});
