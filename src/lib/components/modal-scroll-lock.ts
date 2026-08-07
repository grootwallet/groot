type ScrollDocument = Pick<Document, 'body'>;

type LockState = {
  count: number;
  previousOverflow: string;
};

const locks = new WeakMap<ScrollDocument, LockState>();

export function lockModalScroll(document: ScrollDocument): () => void {
  const existing = locks.get(document);
  if (existing) existing.count += 1;
  else {
    locks.set(document, { count: 1, previousOverflow: document.body.style.overflow });
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
