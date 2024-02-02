type Interlacing = {
  xFactor: number;
  yFactor: number;
  xOffset: number;
  yOffset: number;
};

const interlacing: Interlacing[] = [
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
  passLength: number;
};

const calcPassSizes = (
  width: number,
  height: number,
  bytesPerPixel: number,
  interlacing: Interlacing
): PassSizes => {
  const { xFactor, yFactor, xOffset, yOffset } = interlacing;
  const passWidth = Math.ceil((width - xOffset) / xFactor);
  const passHeight = Math.ceil((height - yOffset) / yFactor);
  const passLength = passHeight * (passWidth * bytesPerPixel + 1);
  return { passWidth, passHeight, passLength };
};

const rewritePixels = (
  width: number,
  bytesPerPixel: number,
  interlace: Interlacing,
  passSizes: PassSizes,
  passPixels: Uint8Array,
  pixels: Uint8Array
) => {
  const { xFactor, yFactor, xOffset, yOffset } = interlace;
  const { passWidth, passHeight } = passSizes;
  for (let y = 0; y < passHeight; y++) {
    for (let x = 0; x < passWidth; x++) {
      const srcIndex = (y * passWidth + x) * bytesPerPixel;
      const dstIndex =
        ((y * yFactor + yOffset) * width + x * xFactor + xOffset) *
        bytesPerPixel;
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
  inversePassFilters: (
    bytesPerPixel: number,
    width: number,
    height: number,
    src: Uint8Array
  ) => Uint8Array,
  src: Uint8Array
) => {
  const pixels = new Uint8Array(width * height * bytesPerPixel);
  for (let i = 0; i < interlacing.length; i++) {
    const interlace = interlacing[i];
    const passSizes = calcPassSizes(width, height, bytesPerPixel, interlace);
    const passPixels = inversePassFilters(
      bytesPerPixel,
      passSizes.passWidth,
      passSizes.passHeight,
      src
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
