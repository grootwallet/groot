import { describe, expect, it } from 'vitest';
import { sats, feeRate } from './contracts';
import { latestActiveProposal, proposalInputsUnavailable } from './proposal-resume';
import type { MultisigProposal } from './contracts';

function proposal(
  proposalId: string,
  status: MultisigProposal['status'],
  createdAt: string
): MultisigProposal {
  return {
    proposalId,
    recipient: 'bcrt1qfixture',
    recipientTestnetAlias: null,
    label: 'Fixture payment',
    amount: sats(1_000),
    fee: sats(100),
    feeRate: feeRate(1),
    total: sats(1_100),
    change: sats(0),
    changeAddresses: [],
    changeTestnetAliases: [],
    outputCount: 1,
    selectedOutpoints: [],
    inputs: [],
    locktime: 0,
    rbf: true,
    network: 'regtest',
    selectionImpact: {
      strategy: 'balanced',
      selectedInputCount: 0,
      estimatedInputWeight: 0,
      fundingLabels: [],
      provenanceState: 'unknown',
      existingClusterCount: 0,
      newClusterLinks: 0,
      hasUnknownProvenance: true,
      hasAddressReuse: false,
      feeDifferenceVsPrivate: null
    },
    psbt: 'fixture',
    signed: status === 'ready' ? 1 : 0,
    required: 1,
    canFinalize: status === 'ready',
    signedFingerprints: [],
    spendPath: 'primary',
    eligibleSignerFingerprints: ['f00dbabe'],
    status,
    createdAt
  };
}

describe('external-signer proposal resumption', () => {
  it('distinguishes a spent-input proposal from an older DTO without a status field', () => {
    const current = proposal('current', 'collecting', '2026-08-10T08:00:00Z');
    expect(proposalInputsUnavailable(null)).toBe(false);
    expect(proposalInputsUnavailable(current)).toBe(false);
    current.inputsAvailable = true;
    expect(proposalInputsUnavailable(current)).toBe(false);
    current.inputsAvailable = false;
    expect(proposalInputsUnavailable(current)).toBe(true);
  });
  it('restores the newest active proposal and ignores completed proposals', () => {
    const collecting = proposal('collecting', 'collecting', '2026-08-10T08:00:00Z');
    const ready = proposal('ready', 'ready', '2026-08-10T09:00:00Z');
    const broadcast = proposal('broadcast', 'broadcast', '2026-08-10T10:00:00Z');

    expect(latestActiveProposal([collecting, broadcast, ready])).toBe(ready);
    expect(latestActiveProposal([broadcast])).toBeNull();
  });
});
