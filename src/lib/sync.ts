import pako from "pako";
import { concatArrayBuffers } from "./util";
import {
  Chunk,
  Context,
  RGBA,
  getbytesPerPixel,
  readChunk,
  readSignature,
} from "./parse";
import { Reader } from "./reader";
import { inversePassFiltersSync } from "./interlace";
import { applyFilter, inverseFilter } from "./filter";

type SyncParseResult = {
  chunks: Chunk[];
  pixels: RGBA[][];
  compressedDataSize: number;
  uncompressedDataSize: number;
  filterComparison?: number[];
};
export type SyncParseOptions = {
  forceFilterType?: number;
  analyze?: boolean;
  interlaceLevel?: number;
};

export const parse = async (
  buffer: ArrayBuffer,
  options: SyncParseOptions = {}
): Promise<SyncParseResult> => {
  const ctx = {} as Context;
  const r = new Reader(buffer);
  if (readSignature(r) !== true) {
    throw new Error("Invalid PNG signature");
  }
  const chunks: Chunk[] = [];
  while (true) {
    const chunk = readChunk(ctx, r)!;
    chunks.push(chunk);
    if (chunk.type === "IEND") {
      break;
    }
  }
  for (const chunk of chunks) {
    if (chunk.type === "IDAT") {
      // skip
    } else {
      // console.log(chunk);
    }
  }
  const ihdr = ctx.ihdr;
  if (ihdr == null) {
    throw new Error("IHDR is not defined");
  }

  const zipped = concatArrayBuffers(
    chunks.flatMap((chunk) => {
      if (!("unknown" in chunk) && chunk.type === "IDAT") {
        return chunk.data;
      }
      return [];
    })
  );
  const unzipped = await pako.inflate(zipped);
  const compressedDataSize = zipped.byteLength;
  const uncompressedDataSize = unzipped.length;

  const { width, height, colorType, bitDepth, interlaceMethod } = ihdr;
  const bytesPerPixel = getbytesPerPixel(colorType, bitDepth);
  const pixels = inverseAllFilters(
    interlaceMethod,
    bytesPerPixel,
    width,
    height,
    unzipped,
    options.forceFilterType,
    options.interlaceLevel
  );
  const result: SyncParseResult = {
    chunks,
    pixels: convertToRGBA(bytesPerPixel, width, height, pixels),
    compressedDataSize,
    uncompressedDataSize,
  };

  if (options.analyze) {
    const filterComparison: number[] = [];
    for (let i = 0; i < 5; i++) {
      const before = new Uint8Array(unzipped.buffer.slice(0));
      const pixels = inverseAllFilters(
        interlaceMethod,
        bytesPerPixel,
        width,
        height,
        before,
        undefined,
        options.interlaceLevel
      );
      const changed = applyAllFilters(
        getbytesPerPixel(ihdr.colorType, ihdr.bitDepth),
        ihdr.width,
        ihdr.height,
        pixels,
        i
      );
      const recompressed = await pako.deflate(changed);
      filterComparison.push(recompressed.byteLength);
    }
    result.filterComparison = filterComparison;
  }
  return result;
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
  interlaceMethod: number,
  bytesPerPixel: number,
  width: number,
  height: number,
  unzipped: Uint8Array,
  forceFilterType: number | undefined,
  interlaceLevel: number | undefined
): Uint8Array => {
  return interlaceMethod === 1
    ? inversePassFiltersSync(
        width,
        height,
        bytesPerPixel,
        inverseFiltersSync,
        unzipped,
        forceFilterType,
        interlaceLevel
      )
    : inverseFiltersSync(
        bytesPerPixel,
        width,
        height,
        unzipped,
        forceFilterType
      );
};

const inverseFiltersSync = (
  bytesPerPixel: number,
  width: number,
  height: number,
  src: Uint8Array,
  forceFilterType: number | undefined
): Uint8Array => {
  const bytesPerLine = bytesPerPixel * width + 1;
  const pixels = new Uint8Array(width * height * bytesPerPixel);
  let prevLine: Uint8Array | null = null;
  for (let y = 0; y < height; y++) {
    const line = src.slice(y * bytesPerLine, (y + 1) * bytesPerLine);
    const filterType =
      forceFilterType != null ? (y === 0 ? 0 : forceFilterType) : line[0];
    const scanLine = line.slice(1);
    inverseFilter(filterType, bytesPerPixel, scanLine, prevLine);
    prevLine = scanLine;
    pixels.set(scanLine, y * (bytesPerLine - 1));
  }
  return pixels;
};

const applyAllFilters = (
  bytesPerPixel: number,
  width: number,
  height: number,
  pixels: Uint8Array,
  newFilterType: number
): Uint8Array => {
  const bytesPerLine = bytesPerPixel * width + 1;
  let prevLine: Uint8Array | null = null;
  let destLine = new Uint8Array(bytesPerLine - 1);
  const dest = new Uint8Array(pixels.length + height);
  prevLine = null;
  for (let y = 0; y < height; y++) {
    const scanLine = pixels.slice(
      y * (bytesPerLine - 1),
      (y + 1) * (bytesPerLine - 1)
    );
    const filterType = prevLine == null ? 1 : newFilterType;
    applyFilter(filterType, bytesPerPixel, scanLine, prevLine, destLine);
    prevLine = scanLine;
    dest.set([filterType], y * bytesPerLine);
    dest.set(destLine, y * bytesPerLine + 1);
  }
  return dest;
};
