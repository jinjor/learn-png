import pako from "pako";
const unzip = pako.inflate;

export const parse = async (buffer: ArrayBuffer): Promise<RGBA[][]> => {
  const view = new DataView(buffer);
  const ctx = { view, offset: 0 } as Context;
  readSignature(ctx);
  const chunks: (Chunk | null)[] = [];
  while (true) {
    const chunk = readChunk(ctx);
    chunks.push(chunk);
    if (chunk?.type === "IEND") {
      break;
    }
  }
  console.log(chunks);
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
  console.log(zipped.length, unzipped.length);

  const bytesPerPixel = getbytesPerPixel(ihdr.colorType, ihdr.bitDepth);
  if (ihdr.interlaceMethod !== 0) {
    throw new Error("Interlace is not supported");
  }
  const bytesPerLine = bytesPerPixel * ihdr.width + 1;
  const pixels: RGBA[][] = [];
  for (let y = 0; y < ihdr.height; y++) {
    const line = new Uint8Array(
      unzipped.buffer,
      y * bytesPerLine,
      bytesPerLine
    );
    const pixelLine: RGBA[] = [];
    for (let x = 0; x < ihdr.width; x++) {
      const offset = x * bytesPerPixel + 1;
      const r = line[offset];
      const g = line[offset + 1];
      const b = line[offset + 2];
      const a = bytesPerPixel === 4 ? line[offset + 3] : 255;
      pixelLine.push({ r, g, b, a });
    }
    pixels.push(pixelLine);
  }
  return pixels;
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
const readRGBUntilLength = (ctx: Context, length: number): RGB[] => {
  const rgb: RGB[] = [];
  for (let i = 0; i < length; i++) {
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
