import { Reader } from "./reader";

export const readExifData = (buffer: ArrayBuffer) => {
  const r = new Reader(buffer);
  const mmii = r.getString(2);
  const littleEndian = mmii === "II";
  r.setEndian(littleEndian);
  if (r.getUint16() !== 42) {
    throw new Error("Invalid EXIF data");
  }
  const ifd0thOffset = r.getUint32();
  r.setOffset(ifd0thOffset);

  const fields: Record<string | number, any> = readIFD(r);
  for (let i = 0; i < fields.length; i++) {
    const [tag, value] = fields[i];
    if (tag === 34665 || tag === 34853 || tag === 40965) {
      r.setOffset(value);
      fields.push(...readIFD(r));
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

const readIFD = (r: Reader) => {
  const fields: [number, any][] = [];
  const numFields = r.getUint16();
  for (let i = 0; i < numFields; i++) {
    const tag = r.getUint16();
    const type = r.getUint16();
    const count = r.getUint32();
    const sizeOfType = sizeOfExifType(type);
    if (sizeOfType == null || sizeOfType * count > 4) {
      const valueOffset = r.getUint32();
      const value = readExifValue(r.branch(valueOffset), tag, type, count);
      fields.push([tag, value]);
    } else {
      const value = readExifValue(r.branch(), tag, type, count);
      r.skip(4);
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

const readExifValue = (r: Reader, tag: number, type: number, count: number) => {
  switch (type) {
    case 1: {
      return r.getUint8();
    }
    case 2: {
      return r.getStringUntilNull(Infinity);
    }
    case 3: {
      return r.getUint16();
    }
    case 4: {
      return r.getUint32();
    }
    case 5: {
      return r.getUint32() / r.getUint32();
    }
    case 7: {
      switch (tag) {
        case 37510: {
          const code = r.getString(8);
          if (!code.startsWith("ASCII")) {
            throw new Error("Not implemented: " + code);
          }
          const comment = r.getString(count - 8);
          return comment;
        }
      }
      return r.getArrayBuffer(count);
    }
    case 9: {
      return r.getInt32() / r.getInt32();
    }
    case 10: {
      return r.getInt32();
    }
    case 11: {
      return r.getInt32() / r.getInt32();
    }
    default: {
      throw new Error("Invalid EXIF type: " + type);
    }
  }
};
