import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const modal = readFileSync(new URL('./Modal.svelte', import.meta.url), 'utf8');

describe('modal overlay', () => {
  it('portals nested dialogs to the document layer', () => {
    expect(modal).toContain('document.body.appendChild(node)');
    expect(modal).toContain('use:portal');
    expect(modal).toContain('node.remove()');
  });

  it('overdraws the translucent macOS title-bar strip on desktop', () => {
    expect(styles).toMatch(
      /\.modal-layer\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*var\(--modal-document-top\);[\s\S]*?min-height:\s*calc\(100dvh \+ 32px\);[\s\S]*?padding:\s*50px 18px 18px;/
    );
  });

  it('uses the normal safe-area viewport on mobile', () => {
    expect(styles).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.modal-layer\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;/
    );
  });
});
