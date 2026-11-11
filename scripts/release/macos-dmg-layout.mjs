import { createHash } from 'node:crypto';

const templateDigest = '26e006bf8e4965f75c976fea86e219abc109763673e0685650576cc303d65ec7';
const supportedNames = new Set(['Groot.app', 'Groot RC.app', 'Groot Mainnet RC.app']);

// The reviewed Finder template has a single leaf page. Its last record is the
// app's icon position, followed by zero padding through the end of the page.
const nameLengthOffset = 5375;
const nameOffset = nameLengthOffset + 4;
const positionOffset = nameOffset + 'Groot.app'.length * 2;
const recordEnd = positionOffset + 28; // Iloc key, blob header and 16-byte position.

export function finderLayoutFor(template, appName) {
  if (!supportedNames.has(appName)) throw new Error('Unreviewed macOS DMG app name');
  if (createHash('sha256').update(template).digest('hex') !== templateDigest) {
    throw new Error('The Finder layout does not match the reviewed template');
  }
  if (appName === 'Groot.app') return template;

  const filename = Buffer.from(appName, 'utf16le').swap16();
  const growth = nameOffset + filename.length - positionOffset;
  if (template.subarray(recordEnd, recordEnd + growth).some((byte) => byte !== 0)) {
    throw new Error('The Finder app position record cannot grow into the template padding');
  }
  const layout = Buffer.from(template);
  layout.writeUInt32BE(appName.length, nameLengthOffset);
  filename.copy(layout, nameOffset);
  template.copy(layout, positionOffset + growth, positionOffset, recordEnd);
  return layout;
}
