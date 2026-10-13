export type UpdateOffer = { version: string; verificationReady: boolean };
export type PreparedUpdate = { filename: string; revealToken: string };
export type UpdateErrorCode =
  | 'offline'
  | 'rate_limited'
  | 'invalid_release'
  | 'unsupported_platform'
  | 'trust_unavailable'
  | 'verification_failed'
  | 'cancelled'
  | 'busy'
  | 'io';
export interface AppUpdatesPort {
  checkUpdate(): Promise<UpdateOffer | null>;
  downloadUpdate(): Promise<PreparedUpdate>;
  cancelUpdate(): Promise<void>;
  revealUpdate(token: string): Promise<void>;
}
