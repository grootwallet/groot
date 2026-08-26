import { MULTISIG_ACCOUNT_PATH } from './policy';

type PublicCosignerFile = {
  version?: unknown;
  label?: unknown;
  fingerprint?: unknown;
  xfp?: unknown;
  accountXpub?: unknown;
  xpub?: unknown;
  p2wsh?: unknown;
  p2wsh_desc?: unknown;
  derivationPath?: unknown;
  p2wsh_deriv?: unknown;
  key_exp?: unknown;
  [key: string]: unknown;
};

export type PublicCosignerImportErrorCode =
  | 'invalid_json'
  | 'invalid_shape'
  | 'private_material'
  | 'missing_fingerprint'
  | 'missing_account_key'
  | 'wrong_network'
  | 'wrong_path'
  | 'invalid_label';

export class PublicCosignerImportError extends Error {
  constructor(
    readonly code: PublicCosignerImportErrorCode,
    message: string,
    readonly guidance: string
  ) {
    super(message);
    this.name = 'PublicCosignerImportError';
  }
}

export type ImportedPublicCosigner = {
  label: string;
  fingerprint: string;
  xpub: string;
  derivationPath: string;
  deviceType?: string | null;
};

function containsPrivateMaterial(value: unknown, key = ''): boolean {
  if (/seed|mnemonic|xprv|private.?key/i.test(key)) return true;
  if (typeof value === 'string') return /(?:^|\s)(?:xprv|tprv)\S*/.test(value);
  if (Array.isArray(value)) return value.some((item) => containsPrivateMaterial(item));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([childKey, child]) =>
      containsPrivateMaterial(child, childKey)
    );
  }
  return false;
}

function normalizeDerivationPath(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[hH]/g, "'") : '';
}

function parseKeyExpression(
  value: unknown
): { fingerprint: string; xpub: string; derivationPath: string } | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/\[([0-9a-fA-F]{8})\/([^\]]+)\]((?:tpub|xpub)[^\s,/)]+)/);
  if (!match) return null;
  return {
    fingerprint: match[1],
    derivationPath: normalizeDerivationPath(`m/${match[2]}`),
    xpub: match[3]
  };
}

const coldcardExportGuidance =
  'On Coldcard, open Settings → Multisig Wallets → Export XPUB, use account 0, and save the JSON file to microSD.';

export function parsePublicCosignerFile(
  encoded: string,
  fallbackLabel: string
): ImportedPublicCosigner {
  let parsed: PublicCosignerFile;
  try {
    parsed = JSON.parse(encoded) as PublicCosignerFile;
  } catch {
    throw new PublicCosignerImportError(
      'invalid_json',
      'This file is not valid JSON.',
      coldcardExportGuidance
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PublicCosignerImportError(
      'invalid_shape',
      'This is not a supported public-key file.',
      coldcardExportGuidance
    );
  }
  if (containsPrivateMaterial(parsed)) {
    throw new PublicCosignerImportError(
      'private_material',
      'This file may contain private key or recovery data.',
      'For safety, Groot will not import it. Export a public XPUB file from the hardware signer instead.'
    );
  }

  const keyExpression = parseKeyExpression(parsed.p2wsh_desc) ?? parseKeyExpression(parsed.key_exp);
  const fingerprint =
    typeof parsed.fingerprint === 'string'
      ? parsed.fingerprint
      : typeof parsed.xfp === 'string'
        ? parsed.xfp
        : keyExpression?.fingerprint;
  // Coldcard exports may include a SLIP-132 `Vpub` in `p2wsh` while its
  // descriptor carries the canonical BIP-32 `tpub`. Prefer that descriptor
  // expression, then the account-scoped field, and only then a generic xpub.
  const xpub =
    typeof parsed.accountXpub === 'string'
      ? parsed.accountXpub
      : (keyExpression?.xpub ??
        (typeof parsed.p2wsh === 'string'
          ? parsed.p2wsh
          : typeof parsed.xpub === 'string'
            ? parsed.xpub
            : undefined));
  const derivationPath = normalizeDerivationPath(
    typeof parsed.derivationPath === 'string'
      ? parsed.derivationPath
      : typeof parsed.p2wsh_deriv === 'string'
        ? parsed.p2wsh_deriv
        : keyExpression?.derivationPath
  );
  const label = (typeof parsed.label === 'string' ? parsed.label : fallbackLabel).trim();
  const deviceType =
    'p2wsh' in parsed || 'p2wsh_desc' in parsed || 'p2wsh_deriv' in parsed || 'xfp' in parsed
      ? 'coldcard'
      : null;

  const fingerprintValue = typeof fingerprint === 'string' ? fingerprint : '';
  if (!/^[0-9a-fA-F]{8}$/.test(fingerprintValue)) {
    throw new PublicCosignerImportError(
      'missing_fingerprint',
      'The file does not contain a valid master fingerprint.',
      coldcardExportGuidance
    );
  }
  if (typeof xpub !== 'string') {
    throw new PublicCosignerImportError(
      'missing_account_key',
      'This file does not contain a P2WSH multisig account key.',
      `${coldcardExportGuidance} Do not use Generic JSON or a device backup.`
    );
  }
  if (xpub.startsWith('xpub')) {
    throw new PublicCosignerImportError(
      'wrong_network',
      'This Coldcard export is for Bitcoin mainnet.',
      'Groot is using Regtest. On Coldcard, open Advanced/Tools → Danger Zone → Testnet Mode → Regtest, then export the XPUB file again.'
    );
  }
  if (!xpub.startsWith('tpub')) {
    throw new PublicCosignerImportError(
      'missing_account_key',
      'The file does not contain a test-network account key.',
      `${coldcardExportGuidance} Do not use Generic JSON or a device backup.`
    );
  }
  if (derivationPath !== MULTISIG_ACCOUNT_PATH) {
    throw new PublicCosignerImportError(
      'wrong_path',
      'The file contains the wrong multisig account path.',
      `Groot requires ${MULTISIG_ACCOUNT_PATH}. ${coldcardExportGuidance}`
    );
  }
  if (!label || label.length > 48) {
    throw new PublicCosignerImportError(
      'invalid_label',
      'The signer filename cannot be used as a label.',
      'Rename the file to a short descriptive name and try again.'
    );
  }

  return { label, fingerprint: fingerprintValue.toLowerCase(), xpub, derivationPath, deviceType };
}
