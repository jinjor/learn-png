import pako from "pako";
import { concatBuffers } from "./util";
import {
  Chunk,
  Context,
  IHDR,
  RGBA,
  getbytesPerPixel,
  readChunk,
  readSignature,
} from "./parse";
import { Reader } from "./reader";
import { inversePassFiltersSync } from "./interlace";
import { inverseFiltersSync } from "./filter";
const unzip = pako.inflate;

type SyncParseResult = {
  chunks: Chunk[];
  pixels: RGBA[][];
  compressedDataSize: number;
  uncompressedDataSize: number;
};

export const parse = async (buffer: ArrayBuffer): Promise<SyncParseResult> => {
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

  const zipped = concatBuffers(
    chunks.flatMap((chunk) => {
      if (!("unknown" in chunk) && chunk.type === "IDAT") {
        return chunk.data;
      }
      return [];
    })
  );
  const unzipped = await unzip(zipped);
  const compressedDataSize = zipped.length;
  const uncompressedDataSize = unzipped.length;
  const pixels = inverseAllFilters(ihdr, unzipped);
  return {
    chunks,
    pixels,
    compressedDataSize,
    uncompressedDataSize,
  };
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

const inverseAllFilters = (ihdr: IHDR, unzipped: Uint8Array): RGBA[][] => {
  const { width, height, colorType, bitDepth, interlaceMethod } = ihdr;
  const bytesPerPixel = getbytesPerPixel(colorType, bitDepth);
  const pixels =
    interlaceMethod === 1
      ? inversePassFiltersSync(
          width,
          height,
          bytesPerPixel,
          inverseFiltersSync,
          unzipped
        )
      : inverseFiltersSync(bytesPerPixel, width, height, unzipped);
  return convertToRGBA(bytesPerPixel, width, height, pixels);
};
