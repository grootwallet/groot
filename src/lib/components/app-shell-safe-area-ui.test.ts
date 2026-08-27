import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

describe('app shell safe areas', () => {
  it('places the onboarding header below the iOS status area', () => {
    expect(styles).toMatch(
      /\.onboarding-brand\s*\{[\s\S]*?height:\s*calc\(72px \+ env\(safe-area-inset-top\)\);[\s\S]*?padding:\s*env\(safe-area-inset-top\) 28px 0;/
    );
    expect(styles).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.onboarding-brand\s*\{[\s\S]*?padding-inline:\s*18px;/
    );
  });
});
