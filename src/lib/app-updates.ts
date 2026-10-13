import type { UpdateErrorCode } from './wallet/contracts';
export const NOTES_DISMISSED = 'groot-notes-dismissed-version';
export const UPDATE_OPT_IN = 'groot-update-checks';
export const UPDATE_LAST_ATTEMPT = 'groot-update-last-attempt';
export const UPDATE_INTERVAL = 24 * 60 * 60 * 1000;
export function shouldCheckUpdates(enabled: boolean, last: number, now: number): boolean {
  return enabled && (!Number.isFinite(last) || last <= 0 || now - last >= UPDATE_INTERVAL);
}
export function updateErrorCopy(cause: unknown): string {
  const copy: Record<UpdateErrorCode, string> = {
    offline: 'Could not reach GitHub. Check your connection and retry.',
    rate_limited: 'GitHub is limiting requests. Try again in an hour.',
    invalid_release: 'This release does not have a supported installer and signed manifest.',
    unsupported_platform: 'Update downloads are unavailable on this platform.',
    trust_unavailable:
      'The release verification key is not configured. No installer was downloaded.',
    verification_failed: 'Installer verification failed. The download was discarded.',
    cancelled: 'Update cancelled.',
    busy: 'An update operation is already running.',
    io: 'Could not save or reveal the installer. Check local file access and retry.'
  };
  return copy[cause as UpdateErrorCode] ?? copy.io;
}
