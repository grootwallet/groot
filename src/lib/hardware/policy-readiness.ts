import type { CosignerDraft } from '$lib/multisig/policy';
import type { SignerPolicyVerification } from '$lib/wallet';

export type PolicyReadinessKind =
  | 'ledger'
  | 'bitbox02'
  | 'bitbox_nova'
  | 'jade'
  | 'coldcard'
  | 'trezor'
  | 'unknown';

export type PolicyRegistrationMode =
  | 'interactive_per_signing'
  | 'interactive_once'
  | 'file_once'
  | 'none'
  | 'unsupported';

export type HardwarePolicyProfile = {
  kind: PolicyReadinessKind;
  name: string;
  registration: PolicyRegistrationMode;
  supported: boolean;
  creationCopy: string;
  firstSigningCopy: string;
};

const profiles: Record<PolicyReadinessKind, HardwarePolicyProfile> = {
  ledger: {
    kind: 'ledger',
    name: 'Ledger',
    registration: 'interactive_per_signing',
    supported: true,
    creationCopy: 'Optional now. Verify the policy and first address before first use.',
    firstSigningCopy: 'Groot keeps the saved policy reference visible while Ledger authorizes it again, then shows the transaction reference.'
  },
  bitbox02: {
    kind: 'bitbox02',
    name: 'BitBox02',
    registration: 'interactive_once',
    supported: true,
    creationCopy: 'Optional now. First-address verification registers this wallet on the device.',
    firstSigningCopy: 'Register and verify the wallet once before the first transaction.'
  },
  bitbox_nova: {
    kind: 'bitbox_nova',
    name: 'BitBox Nova',
    registration: 'unsupported',
    supported: false,
    creationCopy: 'Not supported by Groot’s pinned HWI release and not yet physically certified.',
    firstSigningCopy: 'Do not use this device with Groot until its dedicated certification is complete.'
  },
  jade: {
    kind: 'jade',
    name: 'Blockstream Jade',
    registration: 'interactive_once',
    supported: true,
    creationCopy: 'Optional now. First-address verification registers this wallet on Jade.',
    firstSigningCopy: 'Register and verify the wallet once before the first transaction.'
  },
  coldcard: {
    kind: 'coldcard',
    name: 'Coldcard',
    registration: 'file_once',
    supported: true,
    creationCopy: 'Optional now. Import the exported policy file before this Coldcard signs.',
    firstSigningCopy: 'Import and verify the policy file on-device before continuing to transaction review.'
  },
  trezor: {
    kind: 'trezor',
    name: 'Trezor',
    registration: 'none',
    supported: true,
    creationCopy: 'No wallet registration is required. Trezor receives the complete policy with each request.',
    firstSigningCopy: 'Unlock the device, then review the address or transaction on-device.'
  },
  unknown: {
    kind: 'unknown',
    name: 'hardware signer',
    registration: 'none',
    supported: false,
    creationCopy: 'No device-specific registration claim is available.',
    firstSigningCopy: 'Use the signer’s documented PSBT workflow and verify every transaction detail.'
  }
};

function identity(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

export function policyReadinessKind(value: { label: string; deviceType?: string | null; model?: string | null }): PolicyReadinessKind {
  const normalized = `${identity(value.deviceType)}${identity(value.model)}${identity(value.label)}`;
  if (normalized.includes('bitbox02nova') || normalized.includes('bitboxnova')) return 'bitbox_nova';
  if (normalized.includes('ledger')) return 'ledger';
  if (normalized.includes('bitbox')) return 'bitbox02';
  if (normalized.includes('jade')) return 'jade';
  if (normalized.includes('coldcard')) return 'coldcard';
  if (normalized.includes('trezor')) return 'trezor';
  return 'unknown';
}

export function policyRegistrationProfile(value: Parameters<typeof policyReadinessKind>[0]) {
  return profiles[policyReadinessKind(value)];
}

export function requiresInteractivePolicyVerification(value: Parameters<typeof policyReadinessKind>[0]) {
  const registration = policyRegistrationProfile(value).registration;
  return registration === 'interactive_once' || registration === 'interactive_per_signing';
}

export function requiresPolicySetup(value: Parameters<typeof policyReadinessKind>[0]) {
  return ['interactive_once', 'interactive_per_signing', 'file_once'].includes(policyRegistrationProfile(value).registration);
}

export function repeatsPolicyAuthorizationWhenSigning(value: Parameters<typeof policyReadinessKind>[0]) {
  return policyRegistrationProfile(value).registration === 'interactive_per_signing';
}

export function shouldShowColdcardPolicyHelp(
  signers: Array<{ label: string; fingerprint: string; deviceType?: string | null }>,
  devices: Array<{ label: string; model?: string | null; connected: boolean }>,
  verifications: SignerPolicyVerification[] = []
) {
  const coldcardSigners = signers.filter((signer) => policyReadinessKind(signer) === 'coldcard');
  const hasUnconfirmedColdcard = coldcardSigners.some((signer) => !matchingPolicyVerification(signer, verifications));
  const scanFoundColdcard = devices.some((device) => device.connected && policyReadinessKind(device) === 'coldcard');
  return hasUnconfirmedColdcard && scanFoundColdcard;
}

export function matchingPolicyVerification(
  signer: Pick<CosignerDraft, 'fingerprint'>,
  verifications: SignerPolicyVerification[]
) {
  return verifications.find((verification) => verification.signerFingerprint.toLowerCase() === signer.fingerprint.toLowerCase()) ?? null;
}

export function policyDeviceName(kind: PolicyReadinessKind) {
  return profiles[kind].name;
}

export function policyReadinessLabel(
  value: Parameters<typeof policyReadinessKind>[0],
  verification: SignerPolicyVerification | null
) {
  const profile = policyRegistrationProfile(value);
  if (!profile.supported) return profile.registration === 'unsupported' ? 'Not supported' : 'Not certified';
  if (profile.registration === 'none') return 'No setup needed';
  if (verification) return profile.registration === 'file_once' ? 'Policy imported' : 'Policy verified';
  if (profile.registration === 'file_once') return 'Setup not recorded';
  return 'Setup required';
}
