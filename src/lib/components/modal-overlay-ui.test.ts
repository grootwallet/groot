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

  it('pins the backdrop to every edge of the web viewport', () => {
    expect(styles).toMatch(
      /\.modal-layer\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;[\s\S]*?height:\s*100dvh;[\s\S]*?box-sizing:\s*border-box;[\s\S]*?overflow:\s*hidden;[\s\S]*?align-items:\s*flex-start;[\s\S]*?padding:\s*clamp\(48px, 5vh, 60px\) 18px 18px;/
    );
    expect(modal).not.toContain('--modal-document-top');
  });

  it('top-weights every desktop dialog and keeps tall content inside a scrollable body', () => {
    expect(styles).toMatch(/\.modal\s*\{[^}]*max-height:\s*min\(720px, 100%\);/s);
    expect(styles).toMatch(
      /\.modal-body\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1 1 auto;[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*stable;/s
    );
  });

  it('uses the normal safe-area viewport on mobile', () => {
    expect(styles).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.modal-layer\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;/
    );
    expect(styles).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.modal-layer\s*\{[\s\S]*?height:\s*auto;/
    );
  });

  it('does not depend on scroll-derived backdrop coordinates', () => {
    expect(modal).not.toContain('updateDocumentTop');
    expect(modal).not.toContain("window.addEventListener('scroll'");
  });
});
