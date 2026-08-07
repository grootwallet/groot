import { writable } from 'svelte/store';
import type { CosignerHealthCheck } from '$lib/wallet';

export type CosignerHealthLog = CosignerHealthCheck & { signerId: string };

export const cosignerHealthHistory = writable<Record<string, CosignerHealthLog[]>>({});

export function recordCosignerHealth(signerId: string, check: CosignerHealthCheck) {
  cosignerHealthHistory.update((current) => ({
    ...current,
    [signerId]: [{ ...check, signerId }, ...(current[signerId] ?? [])].slice(0, 20)
  }));
}
