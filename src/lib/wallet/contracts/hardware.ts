export type HardwareDevice = {
  id: string;
  label: string;
  model: string;
  fingerprint: string | null;
  connected: boolean;
  status:
    | 'ready'
    | 'detected'
    | 'needs_pin'
    | 'needs_passphrase'
    | 'needs_companion'
    | 'needs_device_unlock'
    | 'not_ready';
  message: string;
  action: 'import' | 'prompt_pin' | 'confirm_empty_passphrase' | 'retry' | 'none';
};

export type ExternalSignerSource = 'usb' | 'qr' | 'file' | 'manual';
export type ExternalSigner = {
  label: string;
  fingerprint: string;
  xpub: string;
  derivationPath: string;
  source: ExternalSignerSource;
  deviceType: string | null;
};
export type ExternalSignerWallet = {
  version: number;
  name: string;
  signer: ExternalSigner;
  externalDescriptor: string;
  internalDescriptor: string;
};
export type ExternalSignerBackup = { descriptor: string; content: string };
export type SavedFileResult = {
  saved: boolean;
  revealToken: string | null;
  revealLabel: string | null;
};

export type CosignerHealthCheck = {
  status: 'healthy' | 'attention';
  checkedAt: string;
  summary: string;
};

export type HardwareHealthCheckRecord = CosignerHealthCheck & {
  signerFingerprint: string;
};

export type SignerPolicyVerification = {
  signerFingerprint: string;
  deviceType: string;
  verifiedAt: string;
  scope: 'policy_and_address' | 'policy_file_acknowledgement';
  displayedAddress: string | null;
};

export type PolicyVerificationAddress = {
  canonicalAddress: string;
  testnetAlias: string | null;
};
