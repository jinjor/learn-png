export const parse = (data: Uint8Array): void => {
  const view = new DataView(data.buffer);
  const ctx = { view, offset: 0 };
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
  console.log("done");
};

type Context = {
  view: DataView;
  offset: number;
};

type Chunk = IHDR | PLTE | IDAT | IEND;

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
  length: number;
};
type IEND = {
  type: "IEND";
};
type RGB = {
  r: number;
  g: number;
  b: number;
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
  return {
    type: "IHDR",
    width,
    height,
    bitDepth,
    colorType,
    compressionMethod,
    filterMethod,
    interlaceMethod,
  };
};

const readPLTE = (ctx: Context, length: number): PLTE => {
  const palette: RGB[] = [];
  for (let i = 0; i < length; i++) {
    const r = ctx.view.getUint8(ctx.offset);
    ctx.offset += 1;
    const g = ctx.view.getUint8(ctx.offset);
    ctx.offset += 1;
    const b = ctx.view.getUint8(ctx.offset);
    ctx.offset += 1;
    palette.push({ r, g, b });
  }
  return {
    type: "PLTE",
    palette,
  };
};

const readIDAT = (ctx: Context, length: number): IDAT => {
  ctx.offset += length;
  return {
    type: "IDAT",
    length,
  };
};

const readIEND = (ctx: Context): IEND => {
  return {
    type: "IEND",
  };
};
