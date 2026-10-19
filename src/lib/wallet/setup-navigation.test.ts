import { describe, expect, it, vi } from 'vitest';
import { isMobileSetupRoute } from './setup-navigation';
import { createSessionMonitor } from './session-monitor';
import type { WalletSelection } from './contracts';

describe('separate mobile wallet setup', () => {
  it.each(['/mobile/pair', '/mobile/recover', '/mobile/watch'])(
    'keeps an existing locked wallet from interrupting %s',
    async (pathname) => {
      vi.useFakeTimers();
      try {
        const selection: WalletSelection = {
          profile: {
            id: 'existing',
            name: 'Existing wallet',
            network: 'testnet4',
            kind: 'single_key',
            descriptorChecksum: '12345678',
            createdAt: 1,
            backupVerified: true
          },
          unlocked: false
        };
        let currentRoute = pathname;
        const wallet = { session: vi.fn().mockResolvedValue(selection) };
        const onLocked = vi.fn();
        const monitor = createSessionMonitor(wallet, onLocked, () =>
          isMobileSetupRoute(currentRoute)
        );
        monitor.start();
        await vi.advanceTimersByTimeAsync(2500);
        expect(wallet.session).not.toHaveBeenCalled();
        expect(onLocked).not.toHaveBeenCalled();
        currentRoute = '/mobile/sign';
        await vi.advanceTimersByTimeAsync(1000);
        expect(onLocked).toHaveBeenCalledWith(selection);
        monitor.stop();
      } finally {
        vi.useRealTimers();
      }
    }
  );
  it.each(['/mobile/sign', '/', '/receive', '/send', '/multisig', '/mobile/pair/other'])(
    'keeps selected-wallet access protected on %s',
    (pathname) => {
      expect(isMobileSetupRoute(pathname)).toBe(false);
    }
  );
});
