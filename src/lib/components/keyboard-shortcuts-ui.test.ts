import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shell = readFileSync(new URL('./AppShell.svelte', import.meta.url), 'utf8');
const settings = readFileSync(
  new URL('../../routes/settings/+page.svelte', import.meta.url),
  'utf8'
);

describe('global keyboard shortcut UI', () => {
  it('registers once and ignores editable or modal contexts', () => {
    expect(shell).toContain("window.addEventListener('keydown', handleKeyboardShortcut)");
    expect(shell).toContain("window.removeEventListener('keydown', handleKeyboardShortcut)");
    expect(shell).toContain('input, textarea, select, [contenteditable="true"]');
    expect(shell).toContain('document.querySelector(\'[role="dialog"]\')');
    expect(shell).toContain("startupState !== 'ready'");
    expect(shell).toContain('lockedRoute');
    expect(shell).toContain('isPrototypeWallet || !desktopPlatform');
    expect(shell).toContain('shortcutLockPending ||');
    expect(shell).toContain('walletSelectionTask ||');
  });

  it('documents the shared shortcut map in Settings', () => {
    expect(settings).toContain('{#each displayedKeyboardShortcuts as shortcut}');
    expect(settings).toContain("shortcut.id !== 'lock' || (!isPrototypeWallet && desktopPlatform)");
    expect(settings).toContain('class="keyboard-shortcut-grid"');
    expect(settings).toContain('shortcutKeys(shortcut, commandModifier)');
  });

  it('coordinates the native wallet lock before showing the unlock route', () => {
    const cancelHardware = shell.indexOf('await walletService.cancelHardwareOperations()');
    const cancelSync = shell.indexOf(
      'await walletService.cancelSync().catch(() => undefined)',
      cancelHardware
    );
    const lock = shell.indexOf('await walletService.lock()', cancelSync);
    const unlockRoute = shell.indexOf("await goto('/unlock')", lock);
    expect(cancelHardware).toBeGreaterThan(-1);
    expect(cancelSync).toBeGreaterThan(cancelHardware);
    expect(lock).toBeGreaterThan(cancelSync);
    expect(unlockRoute).toBeGreaterThan(lock);
    expect(shell).toContain('shortcutLockPending');
    expect(shell).toContain('await walletSelectionTask?.catch(() => undefined)');
    expect(shell).toContain('if (walletSelectionTask === task) walletSelectionTask = undefined');
    expect(shell).toContain("title: 'Wallet not locked'");
  });
});
