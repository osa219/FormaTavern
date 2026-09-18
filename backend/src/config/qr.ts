import qrcode from 'qrcode-generator';

/**
 * Pure function that generates an ANSI half-block QR code array of strings.
 * Each character cell in the output represents two vertical QR modules (2 rows / 1 col),
 * making the terminal QR matrix compact (~15-18 lines) and squarish.
 */
export function renderQrHalfBlocks(url: string, margin = 2): string[] {
  // TypeNumber 0 for auto-version detection, 'M' error correction level
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const totalRows = moduleCount + margin * 2;
  const totalCols = moduleCount + margin * 2;

  const isDark = (r: number, c: number): boolean => {
    const qrRow = r - margin;
    const qrCol = c - margin;
    if (qrRow < 0 || qrRow >= moduleCount || qrCol < 0 || qrCol >= moduleCount) {
      return false;
    }
    return qr.isDark(qrRow, qrCol);
  };

  const lines: string[] = [];

  for (let r = 0; r < totalRows; r += 2) {
    let line = '';
    for (let c = 0; c < totalCols; c++) {
      const top = isDark(r, c);
      const bottom = r + 1 < totalRows ? isDark(r + 1, c) : false;

      if (top && bottom) {
        line += '█';
      } else if (top && !bottom) {
        line += '▀';
      } else if (!top && bottom) {
        line += '▄';
      } else {
        line += ' ';
      }
    }
    lines.push(line);
  }

  return lines;
}
