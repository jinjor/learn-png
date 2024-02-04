export const applyFilter = (
  filterType: number,
  bytesPerPixel: number,
  scanLine: Uint8Array,
  prevLine: Uint8Array | null,
  inverse: boolean
) => {
  for (let i = 0; i < scanLine.length; i++) {
    const value = calcValueForPixel(
      filterType,
      bytesPerPixel,
      scanLine,
      prevLine,
      i
    );
    scanLine[i] = (scanLine[i] + (inverse ? value : -value)) % 256;
  }
};

const calcValueForPixel = (
  filterType: number,
  bytesPerPixel: number,
  scanLine: Uint8Array,
  prevLine: Uint8Array | null,
  i: number
) => {
  switch (filterType) {
    case 0: {
      return 0;
    }
    case 1: {
      return i >= bytesPerPixel ? scanLine[i - bytesPerPixel] : 0;
    }
    case 2: {
      return prevLine![i];
    }
    case 3: {
      const left = i >= bytesPerPixel ? scanLine[i - bytesPerPixel] : 0;
      const up = prevLine![i];
      return (left + up) / 2;
    }
    case 4: {
      const left = i >= bytesPerPixel ? scanLine[i - bytesPerPixel] : 0;
      const up = prevLine![i];
      const leftUp = i >= bytesPerPixel ? prevLine![i - bytesPerPixel] : 0;
      return paeth(left, up, leftUp);
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

export const applyFiltersSync = (
  bytesPerPixel: number,
  width: number,
  height: number,
  src: Uint8Array,
  inverse: boolean
): Uint8Array => {
  const bytesPerLine = bytesPerPixel * width + 1;
  const pixels = new Uint8Array(width * height * bytesPerPixel);
  let prevLine: Uint8Array | null = null;
  for (let y = 0; y < height; y++) {
    const line = src.slice(y * bytesPerLine, (y + 1) * bytesPerLine);
    const filterType = line[0];
    const scanLine = line.slice(1);
    applyFilter(filterType, bytesPerPixel, scanLine, prevLine, inverse);
    prevLine = scanLine;
    pixels.set(scanLine, y * (bytesPerLine - 1));
  }
  return pixels;
};
