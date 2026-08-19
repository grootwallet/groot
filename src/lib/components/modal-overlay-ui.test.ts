import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

describe('modal overlay', () => {
  it('overdraws the translucent macOS title-bar strip on desktop', () => {
    expect(styles).toMatch(
      /\.modal-layer\s*\{[\s\S]*?inset:\s*-32px 0 0;[\s\S]*?padding:\s*50px 18px 18px;/
    );
  });

  it('uses the normal safe-area viewport on mobile', () => {
    expect(styles).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.modal-layer\s*\{[\s\S]*?inset:\s*0;/
    );
  });
});
