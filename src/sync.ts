import pako from "pako";
import { concatBuffers } from "./util";
import {
  Chunk,
  Context,
  RGBA,
  getbytesPerPixel,
  inverseFilter,
  readData,
  readSignature,
} from "./parse";
import { Reader } from "./reader";
import { interlacing } from "./interlace";
const unzip = pako.inflate;

export const parse = async (buffer: ArrayBuffer): Promise<RGBA[][]> => {
  const ctx = {} as Context;
  const r = new Reader(buffer);
  readSignature(r);
  const chunks: (Chunk | null)[] = [];
  while (true) {
    const chunk = readChunk(ctx, r);
    chunks.push(chunk);
    if (chunk?.type === "IEND") {
      break;
    }
  }
  for (const chunk of chunks) {
    if (chunk?.type === "IDAT") {
      // skip
    } else {
      console.log(chunk);
    }
  }
  const ihdr = ctx.ihdr;
  if (ihdr == null) {
    throw new Error("IHDR is not defined");
  }

  const zipped = concatBuffers(
    chunks.flatMap((chunk) => {
      if (chunk?.type === "IDAT") {
        return chunk.data;
      }
      return [];
    })
  );
  const unzipped = await unzip(zipped);
  // console.log(zipped.length, unzipped.length);

  const bytesPerPixel = getbytesPerPixel(ihdr.colorType, ihdr.bitDepth);
  if (ihdr.interlaceMethod === 1) {
    let array = unzipped;
    const pixels = new Uint8Array(ihdr.width * ihdr.height * bytesPerPixel);
    for (let i = 0; i < 7; i++) {
      const { xFactor, yFactor, xOffset, yOffset } = interlacing[i];
      const passWidth = Math.ceil((ihdr.width - xOffset) / xFactor);
      const passHeight = Math.ceil((ihdr.height - yOffset) / yFactor);
      const passLength = passHeight * (passWidth * bytesPerPixel + 1);
      const passPixels = inverseAllFilters(
        bytesPerPixel,
        passWidth,
        passHeight,
        array
      );
      for (let y = 0; y < passHeight; y++) {
        for (let x = 0; x < passWidth; x++) {
          const srcIndex = (y * passWidth + x) * bytesPerPixel;
          const dstIndex =
            ((y * yFactor + yOffset) * ihdr.width + x * xFactor + xOffset) *
            bytesPerPixel;
          pixels.set(
            passPixels.slice(srcIndex, srcIndex + bytesPerPixel),
            dstIndex
          );
        }
      }
      array = array.slice(passLength);
    }
    return convertToRGBA(bytesPerPixel, ihdr.width, ihdr.height, pixels);
  } else {
    const pixels = inverseAllFilters(
      bytesPerPixel,
      ihdr.width,
      ihdr.height,
      unzipped
    );
    return convertToRGBA(bytesPerPixel, ihdr.width, ihdr.height, pixels);
  }
};
const convertToRGBA = (
  bytesPerPixel: number,
  width: number,
  height: number,
  src: Uint8Array
): RGBA[][] => {
  const bytesPerLine = bytesPerPixel * width;
  const rgbas: RGBA[][] = [];
  for (let y = 0; y < height; y++) {
    const row: RGBA[] = [];
    for (let x = 0; x < width; x++) {
      const i = y * bytesPerLine + x * bytesPerPixel;
      const r = src[i];
      const g = src[i + 1];
      const b = src[i + 2];
      const a = bytesPerPixel === 4 ? src[i + 3] : 255;
      row.push({ r, g, b, a });
    }
    rgbas.push(row);
  }
  return rgbas;
};

const inverseAllFilters = (
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

const readChunk = (ctx: Context, r: Reader): Chunk | null => {
  const length = r.getUint32();
  const type = r.getString(4);
  const data = readData(ctx, r, length, type);
  const crc = r.getUint32();
  return data;
};
