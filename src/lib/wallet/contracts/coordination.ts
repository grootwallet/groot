import type { CosignerDraft } from '$lib/multisig/policy';
import type { MultisigWallet } from './multisig';

export type PairingInvitation = {
  sessionId: string;
  expiresAt: number;
  comparisonCode: string;
  frames: string[];
};

export type PairingResponse = {
  sessionId: string;
  fingerprint: string;
  xpubChecksum: string;
  backupVerified: boolean;
  comparisonCode: string;
  frames: string[];
};

export type PendingMobilePairing = {
  sessionId: string;
};

export type MobilePsbtOutput = { address: string; amountSats: number };

export type MobilePsbtReview = {
  revisionId: string;
  transactionId: string;
  inputCount: number;
  recipients: MobilePsbtOutput[];
  change: MobilePsbtOutput[];
  feeSats: number;
  alreadySignedBy: string[];
};

export type SignedMobilePsbt = {
  revisionId: string;
  signerFingerprint: string;
  signedPsbt: string;
  frames: string[];
};

export type CoordinationStatus = {
  shared: boolean;
  role: 'desktop_coordinator' | 'mobile_cosigner' | 'mobile_watch_only' | null;
  canSignOnThisDevice: boolean;
  mobileSignerFingerprint: string | null;
  keyProtection: string | null;
};

export interface WalletCoordinationPort {
  coordinationStatus(): Promise<CoordinationStatus>;
  encodeWatchOnlyQr(content: string): Promise<string[]>;
  decodeWatchOnlyQr(frames: string[]): Promise<string>;
  createPairingInvitation(
    walletName: string,
    threshold: number,
    signerCount: number
  ): Promise<PairingInvitation>;
  cancelPairing(sessionId: string): Promise<void>;
  decodePairingInvitation(frames: string[]): Promise<string>;
  pendingMobilePairings(): Promise<PendingMobilePairing[]>;
  resumePairingOnMobile(sessionId: string, credential: string): Promise<PairingResponse>;
  acceptPairingOnMobile(
    invitationJson: string,
    signerLabel: string,
    credential: string
  ): Promise<PairingResponse>;
  acceptMobileSigner(frames: string[]): Promise<CosignerDraft>;
  finalizePairingOnDesktop(sessionId: string): Promise<string[]>;
  completePairingOnMobile(frames: string[], credential: string): Promise<MultisigWallet>;
  reviewMobilePsbt(psbt: string): Promise<MobilePsbtReview>;
  signMobilePsbt(
    reviewedPsbt: string,
    revisionId: string,
    credential: string
  ): Promise<SignedMobilePsbt>;
}
