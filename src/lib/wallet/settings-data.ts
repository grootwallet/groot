import type { WalletPort } from './contracts';

type SettingsReader = Pick<
  WalletPort,
  | 'externalSignerWallet'
  | 'hardwareHealthChecks'
  | 'nodeConfig'
  | 'syncSource'
  | 'networkSetupSources'
  | 'recoveryScanSettings'
  | 'recoveryScanStatus'
>;

/** Read public settings as one screen snapshot. Native authorization remains authoritative. */
export async function readSettingsWalletData(
  service: SettingsReader,
  hardware: boolean,
  current: () => boolean
) {
  if (!current()) return null;
  const signer = hardware ? await service.externalSignerWallet() : null;
  if (!current()) return null;
  const health = hardware ? await service.hardwareHealthChecks() : [];
  if (!current()) return null;
  const [node, syncSource, networkSetupSources] = await Promise.all([
    service.nodeConfig(),
    service.syncSource(),
    service.networkSetupSources()
  ]);
  if (!current()) return null;
  const scan = await service.recoveryScanSettings();
  if (!current()) return null;
  const scanStatus = await service.recoveryScanStatus();
  if (!current()) return null;
  return { signer, health, node, syncSource, networkSetupSources, scan, scanStatus };
}
