export const inverseFilter = (
  filterType: number,
  bytesPerPixel: number,
  scanLine: Uint8Array,
  prevLine: Uint8Array | null
) => {
  switch (filterType) {
    case 0: {
      break;
    }
    case 1: {
      for (let i = bytesPerPixel; i < scanLine.length; i++) {
        scanLine[i] = (scanLine[i] + scanLine[i - bytesPerPixel]) % 256;
      }
      break;
    }
    case 2: {
      for (let i = 0; i < scanLine.length; i++) {
        scanLine[i] = (scanLine[i] + prevLine![i]) % 256;
      }
      break;
    }
    case 3: {
      for (let i = 0; i < bytesPerPixel; i++) {
        scanLine[i] = (scanLine[i] + prevLine![i] / 2) % 256;
      }
      for (let i = bytesPerPixel; i < scanLine.length; i++) {
        scanLine[i] =
          (scanLine[i] + (scanLine[i - bytesPerPixel] + prevLine![i]) / 2) %
          256;
      }
      break;
    }
    case 4: {
      for (let i = 0; i < bytesPerPixel; i++) {
        scanLine[i] = (scanLine[i] + paeth(0, prevLine![i], 0)) % 256;
      }
      for (let i = bytesPerPixel; i < scanLine.length; i++) {
        scanLine[i] =
          (scanLine[i] +
            paeth(
              scanLine[i - bytesPerPixel],
              prevLine![i],
              prevLine![i - bytesPerPixel]
            )) %
          256;
      }
      break;
    }
    default: {
      throw new Error(`Invalid filter type: ${filterType}`);
    }
  }
};

const paeth = (
  a: number /* left */,
  b: number /* up */,
  c: number /* left-up */
) => {
  const p = a + b - c;
  const pa = Math.abs(p - a); // left distance
  const pb = Math.abs(p - b); // up distance
  const pc = Math.abs(p - c); // left+up distance
  if (pa <= pb && pa <= pc) {
    return a;
  }
  if (pb <= pc) {
    return b;
  }
  return c;
};

export const inverseFiltersSync = (
  bytesPerPixel: number,
  width: number,
  height: number,
  src: Uint8Array
): Uint8Array => {
  const bytesPerLine = bytesPerPixel * width + 1;
  const pixels = new Uint8Array(width * height * bytesPerPixel);
  let prevLine: Uint8Array | null = null;
  for (let y = 0; y < height; y++) {
    const line = src.slice(y * bytesPerLine, (y + 1) * bytesPerLine);
    const filterType = line[0];
    const scanLine = line.slice(1);
    inverseFilter(filterType, bytesPerPixel, scanLine, prevLine);
    prevLine = scanLine;
    pixels.set(scanLine, y * (bytesPerLine - 1));
  }
  return pixels;
};
