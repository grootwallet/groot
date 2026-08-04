export const MULTISIG_ACCOUNT_PATH = "m/48'/1'/0'/2'";
export const MIN_COSIGNERS = 3;
export const MAX_COSIGNERS = 7;

export type CosignerSource = 'usb' | 'qr' | 'file' | 'manual' | 'virtual';

export type CosignerDraft = {
  id: string;
  label: string;
  fingerprint: string;
  xpub: string;
  derivationPath: string;
  source: CosignerSource;
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

export function normalizeCosigner(cosigner: CosignerDraft): CosignerDraft {
  return {
    ...cosigner,
    label: cosigner.label.trim().replace(/\s+/g, ' '),
    fingerprint: cosigner.fingerprint.trim().toLowerCase(),
    xpub: cosigner.xpub.trim(),
    derivationPath: cosigner.derivationPath.trim()
  };
}

export function validatePolicyDraft(draft: PolicyDraft): string[] {
  const errors: string[] = [];
  const cosigners = draft.cosigners.map(normalizeCosigner);
  if (!draft.name.trim()) errors.push('A wallet name is required.');
  if (cosigners.length < MIN_COSIGNERS) errors.push('Add at least 3 cosigners.');
  if (cosigners.length > MAX_COSIGNERS) errors.push('V1 supports at most 7 cosigners.');
  if (!Number.isInteger(draft.threshold) || draft.threshold < 2) errors.push('At least 2 signatures are required.');
  if (draft.threshold > cosigners.length) errors.push('The threshold cannot exceed the number of cosigners.');
  if (cosigners.some((cosigner) => !cosigner.label)) errors.push('Every cosigner needs a label.');
  if (cosigners.some((cosigner) => !/^[0-9a-f]{8}$/.test(cosigner.fingerprint))) errors.push('Every master fingerprint must contain 8 hexadecimal characters.');
  if (cosigners.some((cosigner) => cosigner.derivationPath !== MULTISIG_ACCOUNT_PATH)) errors.push(`Every v1 key must use ${MULTISIG_ACCOUNT_PATH}.`);
  if (new Set(cosigners.map((cosigner) => cosigner.fingerprint)).size !== cosigners.length) errors.push('Every cosigner must have a unique master fingerprint.');
  if (new Set(cosigners.map((cosigner) => cosigner.xpub)).size !== cosigners.length) errors.push('Every cosigner must have a unique account xpub.');
  return errors;
}

export function coordinatorProgress(required: number, signers: SignerState[]) {
  const signed = signers.filter((signer) => signer.status === 'signed').length;
  return { signed, required, remaining: Math.max(0, required - signed), canFinalize: signed >= required };
}

export function descriptorPreview(threshold: number, cosigners: CosignerDraft[], branch: 0 | 1 = 0): string {
  const keys = cosigners
    .map(normalizeCosigner)
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint))
    .map((cosigner) => `[${cosigner.fingerprint}/48'/1'/0'/2']${cosigner.xpub}/${branch}/*`);
  return `wsh(sortedmulti(${threshold},${keys.join(',')}))`;
}
