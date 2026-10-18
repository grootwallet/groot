type ScrollDocument = Pick<Document, 'body'>;

type LockState = {
  count: number;
  previousOverflow: string;
  documentTop: number;
};

const locks = new WeakMap<ScrollDocument, LockState>();

export function modalDocumentTop(document: ScrollDocument, requestedTop: number): number {
  return locks.get(document)?.documentTop ?? requestedTop;
}

export function lockModalScroll(document: ScrollDocument, documentTop = 0): () => void {
  const existing = locks.get(document);
  if (existing) existing.count += 1;
  else {
    locks.set(document, {
      count: 1,
      previousOverflow: document.body.style.overflow,
      documentTop
    });
    document.body.style.overflow = 'hidden';
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const state = locks.get(document);
    if (!state) return;
    state.count -= 1;
    if (state.count > 0) return;
    document.body.style.overflow = state.previousOverflow;
    locks.delete(document);
  };
}
