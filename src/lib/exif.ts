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
    case 1:
      return "GPSVersionID";
    case 2:
      return "GPSLatitudeRef";
    case 3:
      return "GPSLatitude";
    case 4:
      return "GPSLongitudeRef";
    case 5:
      return "GPSLongitude";
    case 6:
      return "GPSAltitudeRef";
    case 7:
      return "GPSAltitude";
    case 12:
      return "GPSSpeedRef";
    case 13:
      return "GPSSpeed";
    case 16:
      return "GPSImgDirectionRef";
    case 17:
      return "GPSImgDirection";
    case 23:
      return "GPSDestBearingRef";
    case 24:
      return "GPSDestBearing";
    case 29:
      return "GPSDateStamp";
    case 31:
      return "GPSDifferential";
    case 271:
      return "Make";
    case 272:
      return "Model";
    case 274:
      return "Orientation";
    case 282:
      return "XResolution";
    case 283:
      return "YResolution";
    case 296:
      return "ResolutionUnit";
    case 305:
      return "Software";
    case 306:
      return "DateTime";
    case 316:
      return "Artist"; // TODO
    case 33434:
      return "ExposureTime";
    case 33437:
      return "FNumber";
    case 34850:
      return "ExposureProgram";
    case 34855:
      return "PhotographicSensitivity";
    case 36864:
      return "ExifVersion";
    case 36867:
      return "DateTimeOriginal";
    case 36868:
      return "DateTimeDigitized";
    case 36880:
      return "OffsetTime";
    case 36881:
      return "OffsetTimeOriginal";
    case 36882:
      return "OffsetTimeDigitized";
    case 37121:
      return "ComponentsConfiguration";
    case 37377:
      return "ShutterSpeedValue";
    case 37378:
      return "ApertureValue";
    case 37379:
      return "BrightnessValue";
    case 37380:
      return "ExposureBiasValue";
    case 37383:
      return "MeteringMode";
    case 37385:
      return "Flash";
    case 37386:
      return "FocalLength";
    case 37396:
      return "SubjectArea";
    case 37500:
      return "MakerNote";
    case 37510:
      return "UserComment";
    case 37521:
      return "SubSecTimeOriginal";
    case 37522:
      return "SubSecTimeDigitized";
    case 40960:
      return "FlashpixVersion";
    case 40962:
      return "PixelXDimension";
    case 40963:
      return "PixelYDimension";
    case 41495:
      return "SensingMethod";
    case 41729:
      return "SceneType";
    case 41986:
      return "ExposureMode";
    case 41987:
      return "WhiteBalance";
    case 41989:
      return "FocalLengthIn35mmFilm";
    case 41990:
      return "SceneCaptureType";
    case 42034:
      return "LensSpecification";
    case 42035:
      return "LensMake";
    case 42036:
      return "LensModel";
    case 42080:
      return "HyperfocalDistance"; // TODO
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
      return 1;
  }
};

const readExifValue = (r: Reader, tag: number, type: number, count: number) => {
  // console.log(tag, nameOfExifTag(tag), type, count);
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
      return r.getInt32() / r.getInt32();
    }
    case 7: {
      switch (tag) {
        case 36864: {
          const version = r.getString(4);
          return version;
        }
        case 37121: {
          const values = [
            r.getUint8(),
            r.getUint8(),
            r.getUint8(),
            r.getUint8(),
          ];
          return values;
        }
        case 37500: {
          return r.getString(count);
        }
        case 37510: {
          const code = r.getString(8);
          if (!code.startsWith("ASCII")) {
            throw new Error("Not implemented: code=" + code);
          }
          const comment = r.getString(count - 8);
          return comment;
        }
        case 40960: {
          return r.getString(4);
        }
        case 41729: {
          return r.getUint8();
        }
        default: {
          throw new Error("Not implemented: tag=" + tag);
        }
      }
      return r.getString(count);
    }
    case 9: {
      return r.getInt32();
    }
    case 10: {
      return r.getInt32() / r.getInt32();
    }
    default: {
      throw new Error("Invalid EXIF type: " + type);
    }
  }
};
