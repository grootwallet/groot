import { writable } from 'svelte/store';
import type { CosignerHealthCheck } from '$lib/wallet/contracts';

export type ExternalSignerHealthSession = {
  latest: CosignerHealthCheck;
  history: CosignerHealthCheck[];
};

export const externalSignerHealthSessions = writable<Record<string, ExternalSignerHealthSession>>({});

export function externalSignerHealthKey(fingerprint: string) {
  return fingerprint.trim().toLowerCase();
}

export function recordExternalSignerHealthCheck(fingerprint: string, check: CosignerHealthCheck) {
  const key = externalSignerHealthKey(fingerprint);
  externalSignerHealthSessions.update((sessions) => ({
    ...sessions,
    [key]: {
      latest: check,
      history: [check, ...(sessions[key]?.history ?? [])].slice(0, 20)
    }
  }));
}
