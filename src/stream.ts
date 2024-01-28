import pako from "pako";
import {
  Chunk,
  IHDR,
  RGBA,
  getbytesPerPixel,
  inverseFilter,
  readData,
  readSignature,
} from "./parse";
import { concatBuffers, splitIterable } from "./util";
import { Reader } from "./reader";

export function requestPixelStream(stream: AsyncIterable<Uint8Array>): Promise<{
  head: IHDR;
  body: AsyncIterable<RGBA[]>;
}> {
  let foundRow = false;
  let ihdr: IHDR | undefined;
  let prevLine: Uint8Array | null = null;
  return splitIterable(rowStream(stream), (emitter, chunk) => {
    if (chunk.type === "IHDR") {
      ihdr = chunk;
      return;
    }
    if (chunk.type === "IEND") {
      emitter.end();
      return;
    }
    if (chunk.type !== "row") {
      return;
    }
    if (ihdr == null) {
      throw new Error("IHDR is not defined");
    }
    if (!foundRow) {
      foundRow = true;
      emitter.start(ihdr);
    }
    const bytesPerPixel = getbytesPerPixel(ihdr.colorType, ihdr.bitDepth);
    const line = chunk.data;
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
    emitter.data(pixelLine);
  });
}

export async function* rowStream(stream: AsyncIterable<Uint8Array>) {
  let buffer = new Uint8Array(0);

  let ihdr: IHDR | undefined;
  for await (const chunk of unzippedStream(stream)) {
    yield chunk;
    if (chunk.type === "IHDR") {
      ihdr = chunk;
      continue;
    }
    if (chunk.type === "data") {
      if (ihdr == null) {
        throw new Error("IHDR is not defined");
      }
      buffer = concatBuffers([buffer, chunk.data]);
      const bytesPerPixel = getbytesPerPixel(ihdr.colorType, ihdr.bitDepth);
      const width = ihdr.width;
      // const height = ihdr.height;
      const bytesPerRow = width * bytesPerPixel + 1;
      while (buffer.length >= bytesPerRow) {
        const row = buffer.slice(0, bytesPerRow);
        yield {
          type: "row",
          data: row,
        } as const;
        buffer = buffer.slice(bytesPerRow);
      }
    }
  }
}

export async function* unzippedStream(stream: AsyncIterable<Uint8Array>) {
  let resolve: () => void;
  let promise = new Promise<void>((r) => {
    resolve = r;
  });
  let done = false;
  let results: (Chunk | { type: "data"; data: Uint8Array })[] = [];

  const inflator = new pako.Inflate();
  inflator.onData = (data: Uint8Array) => {
    results.push({ type: "data", data });
    resolve();
    promise = new Promise<void>((r) => {
      resolve = r;
    });
  };
  inflator.onEnd = () => {
    done = true;
    resolve();
  };
  (async () => {
    // TODO: error handling
    for await (const { type, data: buffer } of chunkStream(stream)) {
      const r = new Reader(buffer);
      const length = buffer.byteLength;
      const chunk = readData({}, r, length, type);
      if (chunk == null) {
        continue;
      }
      if (chunk.type === "IDAT") {
        inflator.push(chunk.data);
      } else {
        results.push(chunk);
      }
    }
  })();
  while (!done) {
    await promise;
    yield* results;
    results = [];
  }
}

export async function* chunkStream(stream: AsyncIterable<Uint8Array>) {
  let buffer = new Uint8Array(0);
  let sigRead = false;
  for await (const chunk of stream) {
    buffer = concatBuffers([buffer, chunk]);
    while (true) {
      const r = new Reader(buffer.buffer);
      if (!sigRead) {
        if (buffer.length < 8) {
          break;
        }
        readSignature(r);
        sigRead = true;
        buffer = buffer.slice(r.getOffset());
        continue;
      }
      if (buffer.length < 12) {
        break;
      }
      const length = r.getUint32();
      const chunkLength = length + 12;
      if (buffer.length < chunkLength) {
        break;
      }
      const type = r.getString(4);
      const data = r.getArrayBuffer(length);
      const crc = r.getUint32();
      buffer = buffer.slice(chunkLength);
      yield { type, data };
    }
  }
}
