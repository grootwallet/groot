const INPUT_CHARSET =
  '0123456789()[],\'/*abcdefgh@:$%{}IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~ijklmnopqrstuvwxyzABCDEFGH`#"\\ ';
const CHECKSUM_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function polymod(checksum: bigint, value: number) {
  const top = checksum >> 35n;
  let next = ((checksum & 0x7ffffffffn) << 5n) ^ BigInt(value);
  const generators = [0xf5dee51989n, 0xa9fdca3312n, 0x1bab10e32dn, 0x3706b1677an, 0x644d626ffdn];
  for (let index = 0; index < generators.length; index += 1) {
    if (((top >> BigInt(index)) & 1n) !== 0n) next ^= generators[index];
  }
  return next;
}

export function descriptorChecksum(descriptor: string) {
  let checksum = 1n;
  let group = 0;
  let groupSize = 0;
  for (const character of descriptor) {
    const position = INPUT_CHARSET.indexOf(character);
    if (position < 0) return null;
    checksum = polymod(checksum, position & 31);
    group = group * 3 + (position >> 5);
    groupSize += 1;
    if (groupSize === 3) {
      checksum = polymod(checksum, group);
      group = 0;
      groupSize = 0;
    }
  }
  if (groupSize > 0) checksum = polymod(checksum, group);
  for (let index = 0; index < 8; index += 1) checksum = polymod(checksum, 0);
  checksum ^= 1n;
  let encoded = '';
  for (let index = 0; index < 8; index += 1) {
    encoded += CHECKSUM_CHARSET[Number((checksum >> BigInt(5 * (7 - index))) & 31n)];
  }
  return encoded;
}

function withoutChecksum(descriptor: string) {
  return descriptor.trim().split('#', 1)[0];
}

/** Returns the standard multipath form only when both branches are provably identical. */
export function combineDescriptorBranches(receiveDescriptor: string, changeDescriptor: string) {
  const receive = withoutChecksum(receiveDescriptor);
  const change = withoutChecksum(changeDescriptor);
  if (!receive.includes('/0/*')) return null;
  if (receive.replaceAll('/0/*', '/1/*') !== change) return null;
  const combined = receive.replaceAll('/0/*', '/<0;1>/*');
  const checksum = descriptorChecksum(combined);
  return checksum ? `${combined}#${checksum}` : null;
}
