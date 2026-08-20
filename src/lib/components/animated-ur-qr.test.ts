import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const component = readFileSync(new URL('./AnimatedUrQr.svelte', import.meta.url), 'utf8');

describe('animated PSBT QR pacing', () => {
  it('holds each frame for half a second by default', () => {
    expect(component).toContain('intervalMs = 500');
  });
});
