import { publicReleaseDetails } from '../../src/lib/release-notes.ts';
console.log('# Groot 5.3.0\n\nmacOS Apple silicon release notes.\n');
console.log(publicReleaseDetails.map((note) => `- ${note}`).join('\n'));
