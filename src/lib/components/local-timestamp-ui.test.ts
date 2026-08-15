import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const singleKeyReceive = readFileSync(new URL('../../routes/receive/+page.svelte', import.meta.url), 'utf8');
const multisigReceive = readFileSync(new URL('../../routes/multisig/receive/+page.svelte', import.meta.url), 'utf8');
const addressDetails = readFileSync(new URL('./AddressDetailsModal.svelte', import.meta.url), 'utf8');

describe('local timestamp presentation', () => {
  it('uses the shared semantic timestamp in every receive-address surface', () => {
    for (const receiveRoute of [singleKeyReceive, multisigReceive]) {
      expect(receiveRoute).toContain('<LocalTimestamp value={address.created}/>');
      expect(receiveRoute).not.toContain('<small>{address.created}</small>');
    }

    expect(addressDetails).toContain('<LocalTimestamp value={address.created}/>');
    expect(addressDetails).not.toContain('presentLocalTimestamp');
  });
});
