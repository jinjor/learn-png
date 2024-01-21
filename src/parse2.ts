import pako from "pako";

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

type Context = {
  view: DataView;
  offset: number;
  ihdr?: IHDR;
  plte?: PLTE;
};

type Chunk =
  | IHDR
  | PLTE
  | IDAT
  | IEND
  | TRNS
  | ICCP
  | TEXT
  | ITXT
  | PHYS
  | EXIF
  | IDOT;

type IHDR = {
  type: "IHDR";
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  compressionMethod: number;
  filterMethod: number;
  interlaceMethod: number;
};
type PLTE = {
  type: "PLTE";
  palette: RGB[];
};
type IDAT = {
  type: "IDAT";
  data: Uint8Array;
};
type IEND = {
  type: "IEND";
};
type RGB = {
  r: number;
  g: number;
  b: number;
};
type RGBA = {
  r: number;
  g: number;
  b: number;
  a: number;
};
type TRNS = {
  type: "tRNS";
  alphas: Alphas;
};
type Alphas =
  | {
      type: "indexed";
      values: number[];
    }
  | {
      type: "grayscale";
      values: number[];
    }
  | {
      type: "rgb";
      values: RGB[];
    };
type ICCP = {
  type: "iCCP";
  profileName: string;
  compressionMethod: number;
  compressedProfile: number[];
};
type TEXT = {
  type: "tEXt";
  keyword: string;
  text: string;
};
type ITXT = {
  type: "iTXt";
  keyword: string;
  compressionFlag: number;
  compressionMethod: number;
  languageTag: string;
  translatedKeyword: string;
  text: string;
};
type PHYS = {
  type: "pHYs";
  pixelsPerUnitXAxis: number;
  pixelsPerUnitYAxis: number;
  unitSpecifier: number;
};
type EXIF = {
  type: "eXIf";
  length: number;
};
type IDOT = {
  type: "iDOT";
  length: number;
};

const readSignature = (ctx: Context) => {
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < pngSignature.length; i++) {
    if (ctx.view.getUint8(i) !== pngSignature[i]) {
      throw new Error("Invalid PNG signature");
    }
  }
  ctx.offset += pngSignature.length;
};

const readChunk = (ctx: Context): Chunk | null => {
  const length = ctx.view.getUint32(ctx.offset);
  ctx.offset += 4;
  const type = readType(ctx);
  const data = readData(ctx, length, type);
  const crc = ctx.view.getUint32(ctx.offset);
  ctx.offset += 4;
  return data;
};
const readData = (ctx: Context, length: number, type: string): Chunk | null => {
  switch (type) {
    case "IHDR":
      return readIHDR(ctx);
    case "PLTE":
      return readPLTE(ctx, length);
    case "IDAT":
      return readIDAT(ctx, length);
    case "IEND":
      return readIEND(ctx);
    case "tRNS":
      return readTRNS(ctx, length);
    case "iCCP":
      return readICCP(ctx, length);
    case "tEXt":
      return readTEXT(ctx, length);
    case "iTXt":
      return readITXT(ctx, length);
    case "pHYs":
      return readPHYS(ctx, length);
    case "eXIf":
      return readEXIF(ctx, length);
    case "iDOT":
      return readIDOT(ctx, length);
    default:
      console.log(type);
      ctx.offset += length;
      return null;
  }
};

const readType = (ctx: Context): string => {
  const type: string[] = [];
  for (let i = 0; i < 4; i++) {
    type.push(String.fromCharCode(ctx.view.getUint8(ctx.offset + i)));
  }
  ctx.offset += 4;
  return type.join("");
};

const readIHDR = (ctx: Context): IHDR => {
  const width = ctx.view.getUint32(ctx.offset);
  ctx.offset += 4;
  const height = ctx.view.getUint32(ctx.offset);
  ctx.offset += 4;
  const bitDepth = ctx.view.getUint8(ctx.offset);
  ctx.offset += 1;
  const colorType = ctx.view.getUint8(ctx.offset);
  ctx.offset += 1;
  const compressionMethod = ctx.view.getUint8(ctx.offset);
  ctx.offset += 1;
  const filterMethod = ctx.view.getUint8(ctx.offset);
  ctx.offset += 1;
  const interlaceMethod = ctx.view.getUint8(ctx.offset);
  ctx.offset += 1;
  const ihdr = {
    type: "IHDR",
    width,
    height,
    bitDepth,
    colorType,
    compressionMethod,
    filterMethod,
    interlaceMethod,
  } as const;
  ctx.ihdr = ihdr;
  return ihdr;
};

const readPLTE = (ctx: Context, length: number): PLTE => {
  const palette = readRGBUntilLength(ctx, length);
  return {
    type: "PLTE",
    palette,
  };
};

const readIDAT = (ctx: Context, length: number): IDAT => {
  const data = new Uint8Array(ctx.view.buffer, ctx.offset, length);
  ctx.offset += length;
  return {
    type: "IDAT",
    data,
  };
};

const readIEND = (ctx: Context): IEND => {
  return {
    type: "IEND",
  };
};

const readTRNS = (ctx: Context, length: number): TRNS => {
  if (ctx.ihdr == null) {
    throw new Error("IHDR is not defined before tRNS");
  }
  const colorType = ctx.ihdr.colorType;
  switch (colorType) {
    case 0: {
      const values = readBytesUntilLength(ctx, length);
      return {
        type: "tRNS",
        alphas: {
          type: "grayscale",
          values,
        },
      };
    }
    case 2: {
      const values = readRGBUntilLength(ctx, length);
      return {
        type: "tRNS",
        alphas: {
          type: "rgb",
          values,
        },
      };
    }
    case 3: {
      if (ctx.plte == null) {
        throw new Error("PLTE is not defined before tRNS");
      }
      const values = readBytesUntilLength(ctx, length);
      return {
        type: "tRNS",
        alphas: {
          type: "indexed",
          values,
        },
      };
    }
    default:
      throw new Error("Invalid color type: " + colorType);
  }
};
const readICCP = (ctx: Context, length: number): ICCP => {
  const profileName: string[] = [];
  for (let i = 0; i < length; i++) {
    if (i === length - 2) {
      throw new Error("Invalid ICCP chunk");
    }
    const c = ctx.view.getUint8(ctx.offset);
    ctx.offset += 1;
    if (c === 0) {
      break;
    }
    profileName.push(String.fromCharCode(c));
  }
  const compressionMethod = ctx.view.getUint8(ctx.offset);
  ctx.offset += 1;
  const compressedProfile: number[] = [];
  for (let i = 0; i < length - profileName.length - 2; i++) {
    const c = ctx.view.getUint8(ctx.offset);
    compressedProfile.push(c);
    ctx.offset += 1;
  }
  return {
    type: "iCCP",
    profileName: profileName.join(""),
    compressionMethod,
    compressedProfile,
  };
};
const readTEXT = (ctx: Context, length: number): TEXT => {
  const keyword = readStringUntilNull(ctx, length);
  if (keyword == null) {
    throw new Error("Invalid TEXT chunk");
  }
  const text = readStringUntilLength(ctx, length - keyword.length - 1);
  return {
    type: "tEXt",
    keyword,
    text,
  };
};

const readITXT = (ctx: Context, length: number): ITXT => {
  const keyword = readStringUntilNull(ctx, length - 2);
  if (keyword == null) {
    throw new Error("Invalid iTXt chunk");
  }

  const compressionFlag = ctx.view.getUint8(ctx.offset);
  ctx.offset += 1;
  const compressionMethod = ctx.view.getUint8(ctx.offset);
  ctx.offset += 1;
  const languageTag = readStringUntilNull(ctx, length - keyword.length - 3);
  if (languageTag == null) {
    throw new Error("Invalid iTXt chunk");
  }
  const translatedKeyword = readStringUntilNull(
    ctx,
    length - keyword.length - languageTag.length - 4
  );
  if (translatedKeyword == null) {
    throw new Error("Invalid iTXt chunk");
  }
  const text = readStringUntilLength(
    ctx,
    length - keyword.length - languageTag.length - translatedKeyword.length - 5
  );

  return {
    type: "iTXt",
    keyword,
    compressionFlag,
    compressionMethod,
    languageTag,
    translatedKeyword,
    text,
  };
};
const readPHYS = (ctx: Context, length: number): PHYS => {
  const pixelsPerUnitXAxis = ctx.view.getUint32(ctx.offset);
  ctx.offset += 4;
  const pixelsPerUnitYAxis = ctx.view.getUint32(ctx.offset);
  ctx.offset += 4;
  const unitSpecifier = ctx.view.getUint8(ctx.offset);
  ctx.offset += 1;
  return {
    type: "pHYs",
    pixelsPerUnitXAxis,
    pixelsPerUnitYAxis,
    unitSpecifier,
  };
};
const readEXIF = (ctx: Context, length: number): EXIF => {
  ctx.offset += length;
  return {
    type: "eXIf",
    length,
  };
};
const readIDOT = (ctx: Context, length: number): IDOT => {
  ctx.offset += length;
  return {
    type: "iDOT",
    length,
  };
};

// Utility functions

const readStringUntilNull = (ctx: Context, limit: number): string | null => {
  const str: string[] = [];
  for (let i = 0; i < limit; i++) {
    const c = ctx.view.getUint8(ctx.offset);
    ctx.offset += 1;
    if (c === 0) {
      return str.join("");
    }
    str.push(String.fromCharCode(c));
  }
  return null;
};
const readStringUntilLength = (ctx: Context, length: number): string => {
  const str: string[] = [];
  for (let i = 0; i < length; i++) {
    const c = ctx.view.getUint8(ctx.offset);
    ctx.offset += 1;
    str.push(String.fromCharCode(c));
  }
  return str.join("");
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
const readRGBUntilLength = (ctx: Context, length: number): RGB[] => {
  const rgb: RGB[] = [];
  for (let i = 0; i < length; i += 3) {
    const r = ctx.view.getUint8(ctx.offset);
    ctx.offset += 1;
    const g = ctx.view.getUint8(ctx.offset);
    ctx.offset += 1;
    const b = ctx.view.getUint8(ctx.offset);
    ctx.offset += 1;
    rgb.push({ r, g, b });
  }
  return rgb;
};
const readBytesUntilLength = (ctx: Context, length: number): number[] => {
  const bytes: number[] = [];
  for (let i = 0; i < length; i++) {
    const b = ctx.view.getUint8(ctx.offset);
    ctx.offset += 1;
    bytes.push(b);
  }
  return bytes;
};
