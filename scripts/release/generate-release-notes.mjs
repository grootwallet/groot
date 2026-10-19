import { publicReleaseDetails, experimentalPlatformWarning } from '../../src/lib/release-notes.ts';
console.log('# Groot 5.2.0\n\nFinal release notes for the v5.2.0 publication.\n');
console.log(publicReleaseDetails.map((note) => `- ${note}`).join('\n'));
console.log(
  `\n${experimentalPlatformWarning}\n\nInitial Windows/Linux packages are Signet-only, use a separate app identity and bundle no HWI helper. USB/native secret operations remain unavailable; policy-verification prerequisites still apply.\n`
);
