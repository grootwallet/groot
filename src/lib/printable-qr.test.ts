import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { createPrintableQr } from './printable-qr';

describe('createPrintableQr', () => {
  it('creates a deterministic inline vector with a two-module quiet zone', () => {
    const value = 'wsh(sortedmulti(2,example-one,example-two,example-three))';
    const qr = createPrintableQr(value);
    const moduleSize = QRCode.create(value, { errorCorrectionLevel: 'L' }).modules.size;

    expect(qr.size).toBe(moduleSize + 4);
    expect(qr.path).toMatch(/^M\d+ \d+h\d+v1H\d+z/);
    expect(createPrintableQr(value)).toEqual(qr);
  });
});
