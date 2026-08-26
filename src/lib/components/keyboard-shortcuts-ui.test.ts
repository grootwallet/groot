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
  });

  it('documents the shared shortcut map in Settings', () => {
    expect(settings).toContain('{#each keyboardShortcuts as shortcut}');
    expect(settings).toContain('class="keyboard-shortcut-grid"');
    expect(settings).toContain('shortcutKeys(shortcut, commandModifier)');
  });
});
