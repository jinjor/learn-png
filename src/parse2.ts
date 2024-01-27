import pako from "pako";
import { Chunk, IDAT, IEND, IHDR, PLTE, RGBA, readData } from "./parse";

export async function* pixelStream(stream: AsyncIterable<Uint8Array>) {
  let ihdr: IHDR | undefined;
  let prevLine: Uint8Array | null = null;
  for await (const chunk of rowStream(stream)) {
    if (chunk.type === "IHDR") {
      ihdr = chunk;
      continue;
    }
    if (chunk.type !== "row") {
      continue;
    }
    if (ihdr == null) {
      throw new Error("IHDR is not defined");
    }
    const bytesPerPixel = getbytesPerPixel(ihdr.colorType, ihdr.bitDepth);
    const line = chunk.data;
    const filterType = line[0];
    const scanLine = line.slice(1);
    const pixelLine: RGBA[] = [];

    // console.log(filterType);
    switch (filterType) {
      case 0: {
        break;
      }
      case 1: {
        for (let i = bytesPerPixel; i < scanLine.length; i++) {
          scanLine[i] = (scanLine[i] + scanLine[i - bytesPerPixel]) % 256;
        }
        break;
      }
      case 2: {
        for (let i = 0; i < scanLine.length; i++) {
          scanLine[i] = (scanLine[i] + prevLine![i]) % 256;
        }
        break;
      }
      case 3: {
        for (let i = 0; i < bytesPerPixel; i++) {
          scanLine[i] = (scanLine[i] + prevLine![i]) / 2;
        }
        for (let i = bytesPerPixel; i < scanLine.length; i++) {
          scanLine[i] =
            (scanLine[i] + (scanLine[i - bytesPerPixel] + prevLine![i]) / 2) %
            256;
        }
        break;
      }
      case 4: {
        for (let i = 0; i < bytesPerPixel; i++) {
          scanLine[i] = (scanLine[i] + paeth(0, prevLine![i], 0)) % 256;
        }
        for (let i = bytesPerPixel; i < scanLine.length; i++) {
          scanLine[i] =
            (scanLine[i] +
              paeth(
                scanLine[i - bytesPerPixel],
                prevLine![i],
                prevLine![i - bytesPerPixel]
              )) %
            256;
        }
        break;
      }
      default: {
        throw new Error("not implemented");
      }
    }
    prevLine = scanLine;

    for (let x = 0; x < ihdr.width; x++) {
      const offset = x * bytesPerPixel;
      const r = scanLine[offset];
      const g = scanLine[offset + 1];
      const b = scanLine[offset + 2];
      const a = bytesPerPixel === 4 ? scanLine[offset + 3] : 255;
      pixelLine.push({ r, g, b, a });
    }
    yield pixelLine;
  }
}

export async function* rowStream(stream: AsyncIterable<Uint8Array>) {
  let tmp = new Uint8Array(0);

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
      let buffer = concatBuffers([tmp, chunk.data]);
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
      tmp = buffer;
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
    for await (const chunk of chunkStream(stream)) {
      if (chunk === null) {
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
  let tmp = new Uint8Array(0);
  let sigRead = false;
  for await (const chunk of stream) {
    let buffer = concatBuffers([tmp, chunk]);
    while (true) {
      const view = new DataView(buffer.buffer);
      if (!sigRead) {
        const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
        for (let i = 0; i < pngSignature.length; i++) {
          if (view.getUint8(i) !== pngSignature[i]) {
            throw new Error("Invalid PNG signature");
          }
        }
        sigRead = true;
        buffer = buffer.slice(8);
        continue;
      }

      if (buffer.length < 12) {
        break;
      }
      const length = view.getUint32(0);
      const chunkLength = length + 12;
      if (buffer.length < chunkLength) {
        break;
      }
      const type = _readStringUntilLength(view, 4, 4);
      const ctx = {
        view,
        offset: 8,
      };
      const data = readData(ctx, length, type);
      const crc = ctx.view.getUint32(ctx.offset);

      buffer = buffer.slice(chunkLength);
      yield data;
    }
    tmp = buffer;
  }
}

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

const concatBuffers = (bufs: Uint8Array[]): Uint8Array => {
  const totalLength = bufs.reduce((acc, buf) => acc + buf.length, 0);
  const concatBuf = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of bufs) {
    concatBuf.set(buf, offset);
    offset += buf.length;
  }
  return concatBuf;
};

const getbytesPerPixel = (colorType: number, bitDepth: number): number => {
  const bits = getBitsPerPixel(colorType, bitDepth);
  return Math.ceil(bits / 8);
};

const getBitsPerPixel = (colorType: number, bitDepth: number): number => {
  switch (colorType) {
    case 0:
      return bitDepth;
    case 2:
      return 3 * bitDepth;
    case 3:
      return bitDepth;
    case 4:
      return 2 * bitDepth;
    case 6:
      return 4 * bitDepth;
    default:
      throw new Error("Invalid color type: " + colorType);
  }
};

const _readStringUntilLength = (
  view: DataView,
  offset: number,
  length: number
): string => {
  const str: string[] = [];
  for (let i = offset; i < offset + length; i++) {
    const c = view.getUint8(i);
    str.push(String.fromCharCode(c));
  }
  return str.join("");
};
