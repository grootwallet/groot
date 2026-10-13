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

  const groups: string[] = [];
  for (let offset = 0; offset < value.length; offset += MAX_GROUP_LENGTH) {
    groups.push(value.slice(offset, offset + MAX_GROUP_LENGTH));
  }

  return groups;
}

export function groupAddressForDisplay(address: string): string[] {
  return groupIdentifierForDisplay(address);
}
