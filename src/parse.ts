import { readExifData } from "./exif";
import { Reader } from "./reader";

export type Context = {
  ihdr?: IHDR;
  plte?: PLTE;
};

export type ChunkBase = {
  dataLength: number;
};
export type KnownChunkBody =
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
export type ChunkBody = KnownChunkBody | UnknownChunk;
export type KnownChunk = ChunkBase & KnownChunkBody;
export type Chunk = ChunkBase & ChunkBody;

export type IHDR = {
  type: "IHDR";
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  compressionMethod: number;
  filterMethod: number;
  interlaceMethod: number;
};
export type PLTE = {
  type: "PLTE";
  palette: RGB[];
};
export type IDAT = {
  type: "IDAT";
  data: Uint8Array;
};
export type IEND = {
  type: "IEND";
};
export type RGB = {
  r: number;
  g: number;
  b: number;
};
export type RGBA = {
  r: number;
  g: number;
  b: number;
  a: number;
};
export type TRNS = {
  type: "tRNS";
  alphas: Alphas;
};
export type Alphas =
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
export type ICCP = {
  type: "iCCP";
  profileName: string;
  compressionMethod: number;
  compressedProfile: number[];
};
export type TEXT = {
  type: "tEXt";
  keyword: string;
  text: string;
};
export type ITXT = {
  type: "iTXt";
  keyword: string;
  compressionFlag: number;
  compressionMethod: number;
  languageTag: string;
  translatedKeyword: string;
  text: string;
};
export type PHYS = {
  type: "pHYs";
  pixelsPerUnitXAxis: number;
  pixelsPerUnitYAxis: number;
  unitSpecifier: number;
};
export type EXIF = {
  type: "eXIf";
  data: Record<string | number, any>;
};
export type IDOT = {
  type: "iDOT";
};
export type UnknownChunk = {
  unknown: true;
  type: string;
};

export const readSignature = (r: Reader): boolean | null => {
  if (!r.canRead(8)) {
    return null;
  }
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < pngSignature.length; i++) {
    if (r.getUint8() !== pngSignature[i]) {
      return false;
    }
  }
  return true;
};

export const readChunk = (ctx: Context, r: Reader): Chunk | null => {
  if (!r.canRead(4)) {
    return null;
  }
  const length = r.getUint32();
  if (!r.canRead(length + 8)) {
    return null;
  }
  const type = r.getString(4);
  const data = readData(ctx, r, length, type);
  const crc = r.getUint32();
  return { ...data, dataLength: length } as const;
};

export const readData = (
  ctx: Context,
  r: Reader,
  length: number,
  type: string
): ChunkBody => {
  switch (type) {
    case "IHDR":
      return readIHDR(ctx, r);
    case "PLTE":
      return readPLTE(ctx, r, length);
    case "IDAT":
      return readIDAT(r, length);
    case "IEND":
      return readIEND();
    case "tRNS":
      return readTRNS(ctx, r, length);
    case "iCCP":
      return readICCP(r, length);
    case "tEXt":
      return readTEXT(r, length);
    case "iTXt":
      return readITXT(r, length);
    case "pHYs":
      return readPHYS(r, length);
    case "eXIf":
      return readEXIF(r, length);
    case "iDOT":
      return readIDOT(r, length);
    default:
      r.skip(length);
      return {
        unknown: true,
        type,
      };
  }
};

const readIHDR = (ctx: Context, r: Reader): IHDR => {
  const width = r.getUint32();
  const height = r.getUint32();
  const bitDepth = r.getUint8();
  const colorType = r.getUint8();
  const compressionMethod = r.getUint8();
  const filterMethod = r.getUint8();
  const interlaceMethod = r.getUint8();
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

const readPLTE = (ctx: Context, r: Reader, length: number): PLTE => {
  const palette = readRGBUntilLength(r, length);
  const plte = {
    type: "PLTE",
    palette,
  } as const;
  ctx.plte = plte;
  return plte;
};

const readIDAT = (r: Reader, length: number): IDAT => {
  const data = new Uint8Array(r.getArrayBuffer(length));
  return {
    type: "IDAT",
    data,
  };
};

const readIEND = (): IEND => {
  return {
    type: "IEND",
  };
};

const readTRNS = (ctx: Context, r: Reader, length: number): TRNS => {
  if (ctx.ihdr == null) {
    throw new Error("IHDR is not defined before tRNS");
  }
  const colorType = ctx.ihdr.colorType;
  switch (colorType) {
    case 0: {
      const values = readBytesUntilLength(r, length);
      return {
        type: "tRNS",
        alphas: {
          type: "grayscale",
          values,
        },
      };
    }
    case 2: {
      const values = readRGBUntilLength(r, length);
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
      const values = readBytesUntilLength(r, length);
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
const readICCP = (r: Reader, length: number): ICCP => {
  const profileName = r.getStringUntilNull(length - 2);
  if (profileName == null) {
    throw new Error("Invalid iCCP chunk");
  }
  const compressionMethod = r.getUint8();
  const compressedProfile: number[] = [];
  for (let i = 0; i < length - profileName.length - 2; i++) {
    compressedProfile.push(r.getUint8());
  }
  return {
    type: "iCCP",
    profileName,
    compressionMethod,
    compressedProfile,
  };
};
const readTEXT = (r: Reader, length: number): TEXT => {
  const keyword = r.getStringUntilNull(length);
  if (keyword == null) {
    throw new Error("Invalid TEXT chunk");
  }
  const text = r.getString(length - keyword.length - 1);
  return {
    type: "tEXt",
    keyword,
    text,
  };
};

const readITXT = (r: Reader, length: number): ITXT => {
  const keyword = r.getStringUntilNull(length - 2);
  if (keyword == null) {
    throw new Error("Invalid iTXt chunk");
  }
  const compressionFlag = r.getUint8();
  const compressionMethod = r.getUint8();
  const languageTag = r.getStringUntilNull(length - keyword.length - 3);
  if (languageTag == null) {
    throw new Error("Invalid iTXt chunk");
  }
  const translatedKeyword = r.getStringUntilNull(
    length - keyword.length - languageTag.length - 4
  );
  if (translatedKeyword == null) {
    throw new Error("Invalid iTXt chunk");
  }
  const text = r.getString(
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
const readPHYS = (r: Reader, _length: number): PHYS => {
  const pixelsPerUnitXAxis = r.getUint32();
  const pixelsPerUnitYAxis = r.getUint32();
  const unitSpecifier = r.getUint8();
  return {
    type: "pHYs",
    pixelsPerUnitXAxis,
    pixelsPerUnitYAxis,
    unitSpecifier,
  };
};
const readEXIF = (r: Reader, length: number): EXIF => {
  const buf = r.getArrayBuffer(length);
  const data = readExifData(buf);
  return {
    type: "eXIf",
    data,
  };
};
const readIDOT = (r: Reader, length: number): IDOT => {
  r.skip(length);
  return {
    type: "iDOT",
  };
};

const readBytesUntilLength = (r: Reader, length: number): number[] => {
  const bytes: number[] = [];
  for (let i = 0; i < length; i++) {
    bytes.push(r.getUint8());
  }
  return bytes;
};
const readRGBUntilLength = (r: Reader, length: number): RGB[] => {
  const rgb: RGB[] = [];
  for (let i = 0; i < length; i += 3) {
    rgb.push({
      r: r.getUint8(),
      g: r.getUint8(),
      b: r.getUint8(),
    });
  }
  return rgb;
};

export const getbytesPerPixel = (
  colorType: number,
  bitDepth: number
): number => {
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
