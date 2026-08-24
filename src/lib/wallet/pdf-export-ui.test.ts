import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const backupRoute = readFileSync(
  new URL('../../routes/multisig/backup/+page.svelte', import.meta.url),
  'utf8'
);
const policyRoute = readFileSync(
  new URL('../../routes/multisig/+page.svelte', import.meta.url),
  'utf8'
);
const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const renderer = readFileSync(
  new URL('../../../static/pdf-backup-renderer.html', import.meta.url),
  'utf8'
);

describe('native PDF backup presentation', () => {
  it('renders in an isolated hidden document without restyling the live app', () => {
    expect(backupRoute).toContain('savePublicBackupPdf(pending.saveToken, sheet.outerHTML)');
    expect(backupRoute).not.toContain('pdf-export-active');
    expect(appCss).not.toContain('pdf-export-active');
    expect(renderer).toContain('pdf-backup-renderer.css');
  });

  it('embeds printable QR codes as vectors without waiting for images to decode', () => {
    expect(backupRoute).toContain('receivePrintQr = createPrintableQr(current.externalDescriptor)');
    expect(backupRoute).toContain('changePrintQr = createPrintableQr(current.internalDescriptor)');
    expect(backupRoute).toContain('class="print-qr"');
    expect(backupRoute).toContain('<path d={receivePrintQr.path} />');
    expect(backupRoute).not.toContain('<img src={receiveQr} alt="Receive descriptor QR code" />');
    expect(backupRoute).not.toContain('<img src={changeQr} alt="Change descriptor QR code" />');
  });

  it('keeps the policy summary concise and spaces the amount unit', () => {
    expect(policyRoute).toContain('<Amount value={snapshot?.balance.total ?? 0} />');
    expect(policyRoute).toContain(
      'Native SegWit · {networkName(snapshot?.network ?? defaultConfig.network)}'
    );
    expect(policyRoute).not.toContain(' · Spending policy');
    expect(policyRoute).not.toContain('Native SegWit · sortedmulti');
    expect(appCss).toMatch(
      /\.vault-hero \.formatted-amount small\s*\{[^}]*margin-left:\s*0\.28em;/s
    );
  });
});
