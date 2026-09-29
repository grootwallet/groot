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
      /\.modal-layer\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*var\(--modal-document-top\);[\s\S]*?min-height:\s*calc\(100dvh \+ 32px\);[\s\S]*?align-items:\s*flex-start;[\s\S]*?padding:\s*clamp\(56px, 6vh, 72px\) 18px 18px;/
    );
  });

  it('top-weights every desktop dialog and keeps tall content inside a scrollable body', () => {
    expect(styles).toMatch(/\.modal\s*\{[^}]*max-height:\s*min\(720px, calc\(100dvh - 96px\)\);/s);
    expect(styles).toMatch(
      /\.modal-body\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1 1 auto;[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*stable;/s
    );
  });

  it('uses the normal safe-area viewport on mobile', () => {
    expect(styles).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.modal-layer\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;/
    );
  });

  it('reanchors an open desktop dialog after the window viewport changes', () => {
    expect(modal).toContain("window.addEventListener('resize', updateDocumentTop)");
    expect(modal).toContain("window.visualViewport?.addEventListener('resize', updateDocumentTop)");
    expect(modal).toContain("window.removeEventListener('resize', updateDocumentTop)");
    expect(modal).toContain(
      "window.visualViewport?.removeEventListener('resize', updateDocumentTop)"
    );
  });
});
