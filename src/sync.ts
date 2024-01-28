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
  if (ihdr.interlaceMethod !== 0) {
    throw new Error("Interlace is not supported");
  }
  const bytesPerLine = bytesPerPixel * ihdr.width + 1;
  const pixels: RGBA[][] = [];

  let prevLine: Uint8Array | null = null;
  for (let y = 0; y < ihdr.height; y++) {
    const line = new Uint8Array(
      unzipped.buffer,
      y * bytesPerLine,
      bytesPerLine
    );
    const filterType = line[0];
    const scanLine = line.slice(1);
    const pixelLine: RGBA[] = [];

    inverseFilter(filterType, bytesPerPixel, scanLine, prevLine);
    prevLine = scanLine;

    for (let x = 0; x < ihdr.width; x++) {
      const offset = x * bytesPerPixel;
      const r = scanLine[offset];
      const g = scanLine[offset + 1];
      const b = scanLine[offset + 2];
      const a = bytesPerPixel === 4 ? scanLine[offset + 3] : 255;
      pixelLine.push({ r, g, b, a });
    }
    pixels.push(pixelLine);
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
