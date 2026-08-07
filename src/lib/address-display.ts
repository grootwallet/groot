const MAX_GROUP_LENGTH = 4;

export function compactAddress(address: string, prefixLength = 24, suffixLength = 12): string {
  if (!address || address.length <= prefixLength + suffixLength + 1) return address;
  return `${address.slice(0, prefixLength)}…${address.slice(-suffixLength)}`;
}

export function groupAddressForDisplay(address: string): string[] {
  if (!address) return [];

  const groupCount = Math.ceil(address.length / MAX_GROUP_LENGTH);
  const baseLength = Math.floor(address.length / groupCount);
  const longerGroups = address.length % groupCount;
  const groups: string[] = [];
  let offset = 0;

  for (let index = 0; index < groupCount; index += 1) {
    const length = baseLength + (index < longerGroups ? 1 : 0);
    groups.push(address.slice(offset, offset + length));
    offset += length;
  }

  return groups;
}
