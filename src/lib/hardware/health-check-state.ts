import { writable } from 'svelte/store';
import type { CosignerHealthCheck, HardwareHealthCheckRecord } from '$lib/wallet';

export const hardwareHealthChecks = writable<Record<string, CosignerHealthCheck>>({});

export function hardwareHealthKey(fingerprint: string) {
  return fingerprint.trim().toLowerCase();
}

export function setHardwareHealthChecks(records: HardwareHealthCheckRecord[]) {
  hardwareHealthChecks.set(
    Object.fromEntries(
      records.map((record) => [
        hardwareHealthKey(record.signerFingerprint),
        { status: record.status, checkedAt: record.checkedAt, summary: record.summary }
      ])
    )
  );
}

export function recordHardwareHealthCheck(fingerprint: string, check: CosignerHealthCheck) {
  hardwareHealthChecks.update((current) => ({
    ...current,
    [hardwareHealthKey(fingerprint)]: check
  }));
}
