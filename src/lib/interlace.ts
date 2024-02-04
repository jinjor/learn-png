export type Interlacing = {
  xFactor: number;
  yFactor: number;
  xOffset: number;
  yOffset: number;
};

export const adam7: Interlacing[] = [
  { xFactor: 8, yFactor: 8, xOffset: 0, yOffset: 0 },
  { xFactor: 8, yFactor: 8, xOffset: 4, yOffset: 0 },
  { xFactor: 4, yFactor: 8, xOffset: 0, yOffset: 4 },
  { xFactor: 4, yFactor: 4, xOffset: 2, yOffset: 0 },
  { xFactor: 2, yFactor: 4, xOffset: 0, yOffset: 2 },
  { xFactor: 2, yFactor: 2, xOffset: 1, yOffset: 0 },
  { xFactor: 1, yFactor: 2, xOffset: 0, yOffset: 1 },
];

type PassSizes = {
  passWidth: number;
  passHeight: number;
  passLengthPerLine: number;
  passLength: number;
};

export const calcPassSizes = (
  width: number,
  height: number,
  bytesPerPixel: number,
  interlacing: Interlacing
): PassSizes => {
  const { xFactor, yFactor, xOffset, yOffset } = interlacing;
  const passWidth = Math.ceil((width - xOffset) / xFactor);
  const passHeight = Math.ceil((height - yOffset) / yFactor);
  const passLengthPerLine = passWidth * bytesPerPixel + 1;
  const passLength = passHeight * passLengthPerLine;
  return { passWidth, passHeight, passLengthPerLine, passLength };
};

export const remapX = (x: number, interlace: Interlacing) => {
  const { xFactor, xOffset } = interlace;
  return x * xFactor + xOffset;
};
export const remapY = (y: number, interlace: Interlacing) => {
  const { yFactor, yOffset } = interlace;
  return y * yFactor + yOffset;
};

const rewritePixels = (
  width: number,
  bytesPerPixel: number,
  interlace: Interlacing,
  passSizes: PassSizes,
  passPixels: Uint8Array,
  pixels: Uint8Array
) => {
  const { passWidth, passHeight } = passSizes;
  for (let y = 0; y < passHeight; y++) {
    for (let x = 0; x < passWidth; x++) {
      const srcIndex = (y * passWidth + x) * bytesPerPixel;
      const dstIndex =
        (remapY(y, interlace) * width + remapX(x, interlace)) * bytesPerPixel;
      pixels.set(
        passPixels.slice(srcIndex, srcIndex + bytesPerPixel),
        dstIndex
      );
    }
  }
};

export const inversePassFiltersSync = (
  width: number,
  height: number,
  bytesPerPixel: number,
  applyPassFilters: (
    bytesPerPixel: number,
    width: number,
    height: number,
    src: Uint8Array,
    inverse: boolean
  ) => Uint8Array,
  src: Uint8Array
) => {
  const pixels = new Uint8Array(width * height * bytesPerPixel);
  for (let i = 0; i < adam7.length; i++) {
    const interlace = adam7[i];
    const passSizes = calcPassSizes(width, height, bytesPerPixel, interlace);
    const passPixels = applyPassFilters(
      bytesPerPixel,
      passSizes.passWidth,
      passSizes.passHeight,
      src,
      true
    );
    rewritePixels(
      width,
      bytesPerPixel,
      interlace,
      passSizes,
      passPixels,
      pixels
    );
    src = src.slice(passSizes.passLength);
  }
  return pixels;
};

export type Interpolation = {
  spanX: number;
  spanY: number;
};

export const adam7Interpolation: Interpolation[] = [
  { spanX: 8, spanY: 8 },
  { spanX: 4, spanY: 8 },
  { spanX: 4, spanY: 4 },
  { spanX: 2, spanY: 4 },
  { spanX: 2, spanY: 2 },
  { spanX: 1, spanY: 2 },
  { spanX: 1, spanY: 1 },
];
