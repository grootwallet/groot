import { describe, expect, it } from 'vitest';
import { lockModalScroll, modalDocumentTop } from './modal-scroll-lock';

function fakeDocument(overflow = '') {
  return { body: { style: { overflow } } } as unknown as Document;
}

describe('modal scroll lock', () => {
  it('restores the original page overflow after the last dialog closes', () => {
    const document = fakeDocument('auto');
    const releaseFirst = lockModalScroll(document);
    const releaseSecond = lockModalScroll(document);

    expect(document.body.style.overflow).toBe('hidden');
    releaseFirst();
    expect(document.body.style.overflow).toBe('hidden');
    releaseSecond();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('is safe when a dialog cleanup runs more than once', () => {
    const document = fakeDocument();
    const release = lockModalScroll(document);
    release();
    release();
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps nested dialogs anchored to the first dialog document offset', () => {
    const document = fakeDocument();
    expect(modalDocumentTop(document, 420)).toBe(420);
    const release = lockModalScroll(document, 420);
    expect(modalDocumentTop(document, 890)).toBe(420);
    release();
    expect(modalDocumentTop(document, 890)).toBe(890);
  });
});
