import { MULTISIG_ACCOUNT_PATH } from './policy';

type PublicCosignerFile = {
  version?: unknown;
  label?: unknown;
  fingerprint?: unknown;
  xfp?: unknown;
  accountXpub?: unknown;
  xpub?: unknown;
  p2wsh?: unknown;
  derivationPath?: unknown;
  p2wsh_deriv?: unknown;
  [key: string]: unknown;
};

export type ImportedPublicCosigner = {
  label: string;
  fingerprint: string;
  xpub: string;
  derivationPath: string;
};

function containsPrivateMaterial(value: unknown, key = ''): boolean {
  if (/seed|mnemonic|xprv|private.?key/i.test(key)) return true;
  if (typeof value === 'string') return /(?:^|\s)(?:xprv|tprv)\S*/.test(value);
  if (Array.isArray(value)) return value.some((item) => containsPrivateMaterial(item));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([childKey, child]) => containsPrivateMaterial(child, childKey));
  }
  return false;
}

export function parsePublicCosignerFile(encoded: string, fallbackLabel: string): ImportedPublicCosigner {
  let parsed: PublicCosignerFile;
  try {
    parsed = JSON.parse(encoded) as PublicCosignerFile;
  } catch {
    throw new Error('The public-key file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The public-key file has an invalid shape.');
  if (containsPrivateMaterial(parsed)) throw new Error('Private key or recovery material is forbidden in a signer file.');

  const fingerprint = typeof parsed.fingerprint === 'string' ? parsed.fingerprint : parsed.xfp;
  const xpub = typeof parsed.accountXpub === 'string' ? parsed.accountXpub : typeof parsed.xpub === 'string' ? parsed.xpub : parsed.p2wsh;
  const derivationPath = typeof parsed.derivationPath === 'string' ? parsed.derivationPath : parsed.p2wsh_deriv;
  const label = (typeof parsed.label === 'string' ? parsed.label : fallbackLabel).trim();

  const fingerprintValue = typeof fingerprint === 'string' ? fingerprint : '';
  if (!/^[0-9a-fA-F]{8}$/.test(fingerprintValue)) throw new Error('The public-key file needs an 8-character master fingerprint.');
  if (typeof xpub !== 'string' || !xpub.startsWith('tpub')) throw new Error('The public-key file needs a test-chain account tpub.');
  if (derivationPath !== MULTISIG_ACCOUNT_PATH) throw new Error(`The public-key file must use ${MULTISIG_ACCOUNT_PATH}.`);
  if (!label || label.length > 48) throw new Error('The signer label must contain 1 to 48 characters.');

  return { label, fingerprint: fingerprintValue.toLowerCase(), xpub, derivationPath };
}
