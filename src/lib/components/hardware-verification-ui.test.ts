import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const emptyState = readFileSync(new URL('./HardwareDeviceEmptyState.svelte', import.meta.url), 'utf8');
const addressComparison = readFileSync(new URL('./HardwareAddressComparison.svelte', import.meta.url), 'utf8');
const verificationFlow = readFileSync(new URL('./HardwareReceiveVerification.svelte', import.meta.url), 'utf8');
const singleKeyReceive = readFileSync(new URL('../../routes/receive/+page.svelte', import.meta.url), 'utf8');
const multisigReceive = readFileSync(new URL('../../routes/multisig/receive/+page.svelte', import.meta.url), 'utf8');
const hardwareDeviceList = readFileSync(new URL('./HardwareDeviceList.svelte', import.meta.url), 'utf8');
const signerSummary = readFileSync(new URL('./SignerSummary.svelte', import.meta.url), 'utf8');
const hardwareSetup = readFileSync(new URL('../../routes/hardware/new/+page.svelte', import.meta.url), 'utf8');
const singleKeySend = readFileSync(new URL('../../routes/send/+page.svelte', import.meta.url), 'utf8');
const multisigPolicy = readFileSync(new URL('../../routes/multisig/+page.svelte', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../../routes/settings/+page.svelte', import.meta.url), 'utf8');
const deviceDetails = readFileSync(new URL('./DeviceDetailsModal.svelte', import.meta.url), 'utf8');

describe('hardware receive verification UI', () => {
  it('keeps one shared verification component in both receive flows', () => {
    for (const route of [singleKeyReceive, multisigReceive]) {
      expect(route).toContain('<HardwareReceiveVerification');
      expect(route).not.toContain('<TrezorPinModal');
    }
    expect(verificationFlow).toContain('<HardwareAddressComparison');
    expect(addressComparison).toContain('<summary><span>Address details</span><ChevronDown size={14}/></summary>');
    expect(appCss).toContain('.verification-details[open] summary svg { transform: rotate(180deg); }');
  });

  it('centralizes the bounded PIN and retry presentation', () => {
    expect(verificationFlow).toContain('walletService.promptHardwarePin(device.id)');
    expect(verificationFlow).toContain('walletService.sendHardwarePin(pinChallenge, positions)');
    expect(verificationFlow).toContain('<TrezorPinModal');
    expect(verificationFlow).toContain('Scanning again so you can verify the unchanged address.');
    expect(multisigPolicy).toContain('lockedDeviceForHealthCheck');
    expect(multisigPolicy).toContain('<TrezorPinModal');
    expect(multisigPolicy).toContain('Resuming the signer health check.');
  });

  it('exposes the shared identity health check for external single-key signers', () => {
    expect(settings).toContain('Hardware signer identity');
    expect(settings).toContain('walletService.checkHardwareExternalSigner');
    expect(settings).toContain('accountStandard="BIP84"');
    expect(settings).toContain('<DeviceDetailsModal');
    expect(deviceDetails).toContain("accountStandard = 'BIP48'");
    expect(deviceDetails).toContain('saved ${accountStandard} account key');
  });

  it('uses a deliberate retry status instead of an unstyled empty-list paragraph', () => {
    expect(emptyState).toContain('class="hardware-device-empty" role="status"');
    expect(emptyState).toContain('onclick={onretry}');
    expect(emptyState).toContain('Scan again');
    expect(verificationFlow).toContain('<HardwareDeviceEmptyState');
    expect(verificationFlow).not.toMatch(/\{:else\}<p>No compatible/);
  });

  it('uses signer terminology throughout the multisig receive flow', () => {
    expect(verificationFlow).toContain('No compatible signer found');
    expect(verificationFlow).toContain('Connect and unlock a signer saved in this wallet policy');
    expect(`${verificationFlow}\n${multisigReceive}`).not.toMatch(/cosigner/i);
  });

  it('reuses one bounded hardware device list for setup and signing', () => {
    expect(hardwareDeviceList).toContain('{#each devices as device (device.id)}');
    expect(hardwareDeviceList).toContain('onclick={onrescan}');
    for (const route of [hardwareSetup, singleKeySend]) {
      expect(route).toContain('<HardwareDeviceList');
    }
  });

  it('refreshes the selected wallet before opening a newly created hardware wallet', () => {
    const created = hardwareSetup.indexOf('await walletService.createExternalSignerWallet');
    const refreshed = hardwareSetup.indexOf('await walletShell.refreshProfiles()', created);
    const opened = hardwareSetup.indexOf("await goto('/')", refreshed);
    expect(created).toBeGreaterThan(-1);
    expect(refreshed).toBeGreaterThan(created);
    expect(opened).toBeGreaterThan(refreshed);
  });

  it('does not require an unverifiable fingerprint attestation for Trezor imports', () => {
    expect(hardwareSetup).toContain("let isTrezor = $derived(Boolean(signer?.deviceType?.toLowerCase().includes('trezor')))");
    expect(hardwareSetup).toContain('Trezor does not show its master fingerprint during this export, so no fingerprint comparison is required here.');
    expect(hardwareSetup).toContain("isTrezor ? 'Use this Trezor wallet'");
  });

  it('reserves the signer summary while the send wallet identity loads', () => {
    expect(singleKeySend).toContain('loading={!signerSummaryReady}');
    expect(singleKeySend).not.toContain('step < 4 && signerSummaryReady');
    expect(signerSummary).toContain('aria-busy={loading}');
    expect(signerSummary).toContain('class="send-signer-placeholder"');
    expect(appCss).toContain('.send-signers.loading::after');
  });

  it('keeps the single-key transaction review visible while choosing a signing transport', () => {
    const review = singleKeySend.indexOf("aria-label={externalProposal?.canFinalize ? 'Signed transaction review' : 'Transaction review'}");
    const cableAction = singleKeySend.indexOf('onclick={scanHardware}', review);
    expect(review).toBeGreaterThan(-1);
    expect(cableAction).toBeGreaterThan(review);
    expect(singleKeySend).toContain('<TransactionReviewDetails {proposal} onChangeAddress={() => changeAddressOpen = true}/>');
  });
});
