import pako from "pako";
import {
  Chunk,
  IHDR,
  KnownChunk,
  RGBA,
  getbytesPerPixel,
  readData,
  readSignature,
} from "./parse";
import { concatBuffers, splitIterable, typedArrayToBuffer } from "./util";
import { Reader } from "./reader";
import { inverseFilter } from "./filter";
import {
  Interlacing,
  Interpolation,
  adam7,
  adam7Interpolation,
} from "./interlace";

export function requestPixelStream(stream: AsyncIterable<Uint8Array>): Promise<{
  head: IHDR;
  body: AsyncIterable<{
    y: number;
    colors: RGBA[];
    interlace: Interlacing & Interpolation;
  }>;
}> {
  let rowIndex = -1;
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
    rowIndex++;
    if (rowIndex === 0) {
      emitter.start(ihdr);
    }
    const bytesPerPixel = getbytesPerPixel(ihdr.colorType, ihdr.bitDepth);
    if (ihdr.interlaceMethod === 1) {
    } else {
      const y = rowIndex;
      const line = chunk.data;
      const filterType = line[0];
      const scanLine = line.slice(1);

      inverseFilter(filterType, bytesPerPixel, scanLine, prevLine);
      prevLine = scanLine;
      const interlace = { ...adam7[6], ...adam7Interpolation[6] };

      const colors: RGBA[] = [];
      for (let x = 0; x < ihdr.width; x++) {
        const offset = x * bytesPerPixel;
        const r = scanLine[offset];
        const g = scanLine[offset + 1];
        const b = scanLine[offset + 2];
        const a = bytesPerPixel === 4 ? scanLine[offset + 3] : 255;
        colors.push({ r, g, b, a });
      }
      emitter.data({
        y,
        colors,
        interlace,
      });
    }
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
  let results: (KnownChunk | { type: "data"; data: Uint8Array })[] = [];

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
    for await (const chunk of chunkStream(stream)) {
      if ("unknown" in chunk) {
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

export async function* chunkStream(
  stream: AsyncIterable<Uint8Array>
): AsyncIterable<Chunk> {
  let buffer = new Uint8Array(0);
  let sigRead = false;
  let dataLeft = -1;
  for await (const chunk of stream) {
    buffer = concatBuffers([buffer, chunk]);
    while (true) {
      const r = new Reader(buffer.buffer, buffer.byteOffset);
      if (!sigRead) {
        if (readSignature(r) !== true) {
          throw new Error("Invalid PNG signature");
        }
        sigRead = true;
        buffer = buffer.slice(r.getOffset());
        continue;
      }
      if (dataLeft === -1) {
        if (!r.canRead(8)) {
          break;
        }
        const length = r.getUint32();
        const type = r.getString(4);
        if (type === "IDAT") {
          dataLeft = length;
          buffer = buffer.slice(8);
          continue;
        } else {
          if (!r.canRead(length + 4)) {
            break;
          }
          const data = readData({}, r, length, type);
          const crc = r.getUint32();

          const chunkLength = length + 12;
          buffer = buffer.slice(chunkLength);
          yield { ...data, dataLength: length } as const;
        }
      } else {
        if (r.canRead(dataLeft + 4)) {
          const data = r.getArrayBuffer(dataLeft);
          const crc = r.getUint32();
          const chunk = {
            type: "IDAT",
            data,
            dataLength: dataLeft,
          } as Chunk;
          buffer = buffer.slice(dataLeft + 4);
          dataLeft = -1;
          yield chunk;
        } else if (r.canRead(dataLeft)) {
          break;
        } else {
          const data = typedArrayToBuffer(buffer);
          const chunk = {
            type: "IDAT",
            data,
            dataLength: data.byteLength,
          } as Chunk;
          buffer = new Uint8Array(0);
          dataLeft -= data.byteLength;
          yield chunk;
          break;
        }
      }
    }
  }
}
