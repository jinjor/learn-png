import { Context, readStringUntilLength, readStringUntilNull } from "./util";

export const readExifData = (ctx: Context) => {
  const mmii = readStringUntilLength(ctx, 2);
  const littleEndian = mmii === "II";
  const n = ctx.view.getUint16(ctx.offset, littleEndian);
  if (n !== 42) {
    throw new Error("Invalid EXIF data");
  }
  ctx.offset += 2;
  const ifd0thOffset = ctx.view.getUint32(ctx.offset, littleEndian);
  ctx.offset += 4;
  ctx.offset = ifd0thOffset;

  const fields: Record<string | number, any> = readIFD(ctx, littleEndian);
  for (let i = 0; i < fields.length; i++) {
    const [tag, value] = fields[i];
    if (tag === 34665 || tag === 34853 || tag === 40965) {
      ctx.offset = value;
      fields.push(...readIFD(ctx, littleEndian));
      fields[i][0] = 0;
      continue;
    }
    fields[i][0] = nameOfExifTag(tag);
  }
  return Object.fromEntries(fields.filter(([tag]) => tag !== 0));
};

const nameOfExifTag = (tag: number) => {
  switch (tag) {
    case 282:
      return "XResolution";
    case 283:
      return "YResolution";
    case 296:
      return "ResolutionUnit";
    case 37510:
      return "UserComment";
    case 40962:
      return "PixelXDimension";
    case 40963:
      return "PixelYDimension";
    default:
      return tag;
  }
};

const readIFD = (ctx: Context, littleEndian: boolean) => {
  const fields: [number, any][] = [];
  const numFields = ctx.view.getUint16(ctx.offset, littleEndian);
  ctx.offset += 2;
  for (let i = 0; i < numFields; i++) {
    const tag = ctx.view.getUint16(ctx.offset, littleEndian);
    ctx.offset += 2;
    const type = ctx.view.getUint16(ctx.offset, littleEndian);
    ctx.offset += 2;
    const count = ctx.view.getUint32(ctx.offset, littleEndian);
    ctx.offset += 4;
    const sizeOfType = sizeOfExifType(type);
    if (sizeOfType == null || sizeOfType * count > 4) {
      const valueOffset = ctx.view.getUint32(ctx.offset, littleEndian);
      ctx.offset += 4;
      const value = readExifValue(
        ctx.view,
        valueOffset,
        tag,
        type,
        count,
        littleEndian
      );
      fields.push([tag, value]);
    } else {
      const value = readExifValue(
        ctx.view,
        ctx.offset,
        tag,
        type,
        count,
        littleEndian
      );
      ctx.offset += 4;
      fields.push([tag, value]);
    }
  }
  return fields;
};

const sizeOfExifType = (type: number) => {
  switch (type) {
    case 1:
      return 1;
    case 3:
      return 2;
    case 4:
      return 4;
    case 5:
      return 8;
    case 9:
      return 4;
    case 10:
      return 8;
    default:
      return null;
  }
};

const readExifValue = (
  view: DataView,
  offset: number,
  tag: number,
  type: number,
  count: number,
  littleEndian: boolean
) => {
  switch (type) {
    case 1: {
      return view.getUint8(offset);
    }
    case 2: {
      return readStringUntilNull({ view, offset }, Infinity);
    }
    case 3: {
      return view.getUint16(offset, littleEndian);
    }
    case 4: {
      return view.getUint32(offset, littleEndian);
    }
    case 5: {
      return (
        view.getUint32(offset, littleEndian) /
        view.getUint32(offset + 4, littleEndian)
      );
    }
    case 7: {
      switch (tag) {
        case 37510: {
          const code = readStringUntilNull({ view, offset }, 8);
          if (code !== "ASCII") {
            // throw new Error("Not implemented: " + code);
            break;
          }
          const comment = readStringUntilLength(
            { view, offset: offset + 8 },
            count - 8
          );
          return comment;
        }
      }
      return view.buffer.slice(offset, offset + count);
    }
    case 9: {
      return (
        view.getInt32(offset, littleEndian) /
        view.getInt32(offset + 4, littleEndian)
      );
    }
    case 10: {
      return view.getInt32(offset, littleEndian);
    }
    case 11: {
      return (
        view.getInt32(offset, littleEndian) /
        view.getInt32(offset + 4, littleEndian)
      );
    }
    default: {
      throw new Error("Invalid EXIF type: " + type);
    }
  }
};
