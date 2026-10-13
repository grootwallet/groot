export function compareBomRefs(left, right) {
  const leftRef = left['bom-ref'];
  const rightRef = right['bom-ref'];
  return leftRef < rightRef ? -1 : leftRef > rightRef ? 1 : 0;
}
