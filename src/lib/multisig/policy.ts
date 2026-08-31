export const MULTISIG_ACCOUNT_PATH = "m/48'/1'/0'/2'";
export const MIN_COSIGNERS = 3;
export const MAX_COSIGNERS = 8;

export type CosignerSource = 'usb' | 'qr' | 'file' | 'manual' | 'virtual';

export type CosignerDraft = {
  id: string;
  label: string;
  fingerprint: string;
  xpub: string;
  derivationPath: string;
  source: CosignerSource;
  deviceType?: string | null;
};

export type PolicyDraft = {
  name: string;
  threshold: number;
  cosigners: CosignerDraft[];
};

export type SignerState = {
  cosignerId: string;
  status: 'ready' | 'signing' | 'signed' | 'rejected' | 'unavailable';
};

export function normalizeSignerLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ');
}

export function signerLabelError(label: string): string | null {
  const normalized = normalizeSignerLabel(label);
  if (!normalized) return 'Enter a signer name.';
  if (Array.from(normalized).length > 48)
    return 'Signer names must contain 48 characters or fewer.';
  return null;
}

export function normalizeCosigner(cosigner: CosignerDraft): CosignerDraft {
  return {
    ...cosigner,
    label: normalizeSignerLabel(cosigner.label),
    fingerprint: cosigner.fingerprint.trim().toLowerCase(),
    xpub: cosigner.xpub.trim(),
    derivationPath: cosigner.derivationPath.trim()
  };
}

export function findDuplicateCosigner(
  existing: CosignerDraft[],
  candidate: CosignerDraft
): { cosigner: CosignerDraft; match: 'fingerprint' | 'xpub' | 'both' } | null {
  const normalizedCandidate = normalizeCosigner(candidate);
  for (const cosigner of existing) {
    const normalizedExisting = normalizeCosigner(cosigner);
    const fingerprintMatches = normalizedExisting.fingerprint === normalizedCandidate.fingerprint;
    const xpubMatches = normalizedExisting.xpub === normalizedCandidate.xpub;
    if (fingerprintMatches || xpubMatches) {
      return {
        cosigner,
        match:
          fingerprintMatches && xpubMatches ? 'both' : fingerprintMatches ? 'fingerprint' : 'xpub'
      };
    }
  }
  return null;
}

export function validatePolicyDraft(draft: PolicyDraft): string[] {
  const errors: string[] = [];
  const cosigners = draft.cosigners.map(normalizeCosigner);
  if (!draft.name.trim()) errors.push('A wallet name is required.');
  else if (draft.name.trim().length > 48)
    errors.push('The wallet name must be 48 characters or fewer.');
  if (cosigners.length < MIN_COSIGNERS) errors.push('Add at least 3 signers.');
  if (cosigners.length > MAX_COSIGNERS) errors.push('V1 supports at most 8 signers.');
  if (!Number.isInteger(draft.threshold) || draft.threshold < 2)
    errors.push('At least 2 signatures are required.');
  if (draft.threshold > cosigners.length)
    errors.push('The threshold cannot exceed the number of signers.');
  if (cosigners.some((cosigner) => !cosigner.id.trim() || cosigner.id.length > 128))
    errors.push('Every signer needs a bounded stable identifier.');
  if (new Set(cosigners.map((cosigner) => cosigner.id.trim())).size !== cosigners.length)
    errors.push('Every signer must have a unique identifier.');
  if (cosigners.some((cosigner) => !cosigner.label)) errors.push('Every signer needs a label.');
  else if (cosigners.some((cosigner) => cosigner.label.length > 48))
    errors.push('Signer labels must be 48 characters or fewer.');
  if (cosigners.some((cosigner) => !/^[0-9a-f]{8}$/.test(cosigner.fingerprint)))
    errors.push('Every master fingerprint must contain 8 hexadecimal characters.');
  if (cosigners.some((cosigner) => cosigner.derivationPath !== MULTISIG_ACCOUNT_PATH))
    errors.push(`Every v1 key must use ${MULTISIG_ACCOUNT_PATH}.`);
  if (cosigners.some((cosigner) => !/^(tpub|upub|vpub)/.test(cosigner.xpub)))
    errors.push('Every account key must use a test-network extended public key.');
  if (new Set(cosigners.map((cosigner) => cosigner.fingerprint)).size !== cosigners.length)
    errors.push('Every signer must have a unique master fingerprint.');
  if (new Set(cosigners.map((cosigner) => cosigner.xpub)).size !== cosigners.length)
    errors.push('Every signer must have a unique account xpub.');
  return errors;
}

export function coordinatorProgress(required: number, signers: SignerState[]) {
  const signed = signers.filter((signer) => signer.status === 'signed').length;
  return {
    signed,
    required,
    remaining: Math.max(0, required - signed),
    canFinalize: signed >= required
  };
}

export function descriptorPreview(
  threshold: number,
  cosigners: CosignerDraft[],
  branch: 0 | 1 = 0
): string {
  const keys = cosigners
    .map(normalizeCosigner)
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint))
    .map((cosigner) => `[${cosigner.fingerprint}/48'/1'/0'/2']${cosigner.xpub}/${branch}/*`);
  return `wsh(sortedmulti(${threshold},${keys.join(',')}))`;
}
