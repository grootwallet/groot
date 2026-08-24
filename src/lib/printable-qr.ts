import QRCode from 'qrcode';

export type PrintableQr = {
  path: string;
  size: number;
};

const QUIET_ZONE_MODULES = 2;

export function createPrintableQr(value: string): PrintableQr {
  const modules = QRCode.create(value, { errorCorrectionLevel: 'L' }).modules;
  const path: string[] = [];

  for (let row = 0; row < modules.size; row += 1) {
    let column = 0;
    while (column < modules.size) {
      if (!modules.get(row, column)) {
        column += 1;
        continue;
      }

      const start = column;
      while (column < modules.size && modules.get(row, column)) column += 1;
      path.push(
        `M${start + QUIET_ZONE_MODULES} ${row + QUIET_ZONE_MODULES}h${column - start}v1H${start + QUIET_ZONE_MODULES}z`
      );
    }
  }

  return {
    path: path.join(''),
    size: modules.size + QUIET_ZONE_MODULES * 2
  };
}
