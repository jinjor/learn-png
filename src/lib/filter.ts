export const inverseFilter = (
  filterType: number,
  bytesPerPixel: number,
  scanLine: Uint8Array,
  prevLine: Uint8Array | null
) => {
  for (let i = 0; i < scanLine.length; i++) {
    const value = calcValueForPixel(
      filterType,
      bytesPerPixel,
      scanLine,
      prevLine,
      i
    );
    scanLine[i] = (scanLine[i] + value) % 256;
  }
};

export const applyFilter = (
  filterType: number,
  bytesPerPixel: number,
  scanLine: Uint8Array,
  prevLine: Uint8Array | null,
  destLine: Uint8Array
) => {
  for (let i = 0; i < scanLine.length; i++) {
    const value = calcValueForPixel(
      filterType,
      bytesPerPixel,
      scanLine,
      prevLine,
      i
    );
    destLine[i] = (scanLine[i] - value + 256) % 256;
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
