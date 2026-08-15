import { describe, expect, it } from 'vitest';
import {
  matchingPolicyVerification,
  policyReadinessKind,
  policyReadinessLabel,
  policyRegistrationProfile,
  repeatsPolicyAuthorizationWhenSigning,
  requiresInteractivePolicyVerification,
  requiresPolicySetup,
  shouldShowColdcardPolicyHelp
} from './policy-readiness';

const coldcardEvidence = { signerFingerprint: 'F00DBABE', deviceType: 'coldcard', verifiedAt: '2026-08-12T10:00:00Z', scope: 'policy_file_acknowledgement' as const, displayedAddress: null };

describe('hardware policy readiness', () => {
  it.each([
    [{ label: 'ledger_nano_s_plus', model: 'ledger' }, 'ledger'],
    [{ label: 'BitBox02', model: 'bitbox02_multi' }, 'bitbox02'],
    [{ label: 'BitBox02 Nova', model: 'bitbox02_nova_multi' }, 'bitbox_nova'],
    [{ label: 'Blockstream Jade', model: 'jade' }, 'jade'],
    [{ label: 'Coldcard MK4', model: 'coldcard' }, 'coldcard'],
    [{ label: 'Trezor 1', model: 'trezor' }, 'trezor']
  ] as const)('classifies %o as %s', (device, expected) => {
    expect(policyReadinessKind(device)).toBe(expected);
  });

  it('models the exact registration behavior of each supported family', () => {
    expect(policyRegistrationProfile({ label: 'Ledger' }).registration).toBe('interactive_per_signing');
    expect(policyRegistrationProfile({ label: 'BitBox02' }).registration).toBe('interactive_once');
    expect(policyRegistrationProfile({ label: 'Jade' }).registration).toBe('interactive_once');
    expect(policyRegistrationProfile({ label: 'Coldcard' }).registration).toBe('file_once');
    expect(policyRegistrationProfile({ label: 'Trezor One' }).registration).toBe('none');
    expect(policyRegistrationProfile({ label: 'BitBox Nova' }).registration).toBe('interactive_once');
  });

  it('separates interactive verification, setup gates, and Ledger repeat authorization', () => {
    expect(requiresInteractivePolicyVerification({ label: 'Ledger' })).toBe(true);
    expect(requiresPolicySetup({ label: 'Coldcard' })).toBe(true);
    expect(requiresInteractivePolicyVerification({ label: 'Coldcard' })).toBe(false);
    expect(requiresPolicySetup({ label: 'Trezor One' })).toBe(false);
    expect(repeatsPolicyAuthorizationWhenSigning({ label: 'Ledger' })).toBe(true);
    expect(repeatsPolicyAuthorizationWhenSigning({ label: 'BitBox02' })).toBe(false);
  });

  it('shows Coldcard setup only for a connected, unconfirmed wallet signer', () => {
    const signers = [{ label: 'Coldcard MK4', deviceType: 'coldcard', fingerprint: 'f00dbabe' }];
    const connected = [{ label: 'Coldcard MK4', model: 'coldcard', connected: true }];
    expect(shouldShowColdcardPolicyHelp(signers, connected)).toBe(true);
    expect(shouldShowColdcardPolicyHelp(signers, connected, [coldcardEvidence])).toBe(false);
    expect(shouldShowColdcardPolicyHelp(signers, [{ ...connected[0], connected: false }])).toBe(false);
  });

  it('uses explicit readiness labels instead of a generic ready state', () => {
    expect(policyReadinessLabel({ label: 'Trezor One' }, null)).toBe('No setup needed');
    expect(policyReadinessLabel({ label: 'Coldcard' }, null)).toBe('Setup not recorded');
    expect(policyReadinessLabel({ label: 'Coldcard' }, coldcardEvidence)).toBe('Policy imported');
    expect(policyReadinessLabel({ label: 'BitBox Nova' }, null)).toBe('Setup required');
  });

  it('matches persisted evidence by normalized fingerprint', () => {
    expect(matchingPolicyVerification({ fingerprint: 'f00dbabe' }, [coldcardEvidence])).toEqual(coldcardEvidence);
  });
});
