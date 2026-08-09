const MAX_GROUP_LENGTH = 4;

export function compactIdentifier(value: string, prefixLength = 12, suffixLength = 8): string {
  if (!value || value.length <= prefixLength + suffixLength + 1) return value;
  return `${value.slice(0, prefixLength)}…${value.slice(-suffixLength)}`;
}

export function compactAddress(address: string, prefixLength = 12, suffixLength = 8): string {
  return compactIdentifier(address, prefixLength, suffixLength);
}

export function groupIdentifierForDisplay(value: string): string[] {
  if (!value) return [];

  const groupCount = Math.ceil(value.length / MAX_GROUP_LENGTH);
  const baseLength = Math.floor(value.length / groupCount);
  const longerGroups = value.length % groupCount;
  const groups: string[] = [];
  let offset = 0;

  for (let index = 0; index < groupCount; index += 1) {
    const length = baseLength + (index < longerGroups ? 1 : 0);
    groups.push(value.slice(offset, offset + length));
    offset += length;
  }

  return groups;
}

export function groupAddressForDisplay(address: string): string[] {
  return groupIdentifierForDisplay(address);
}
