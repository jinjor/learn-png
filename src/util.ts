export type Context = {
  view: DataView;
  offset: number;
};

export const readStringUntilNull = (
  ctx: Context,
  limit: number
): string | null => {
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
export const readStringUntilLength = (ctx: Context, length: number): string => {
  const str: string[] = [];
  for (let i = 0; i < length; i++) {
    const c = ctx.view.getUint8(ctx.offset);
    ctx.offset += 1;
    str.push(String.fromCharCode(c));
  }
  return str.join("");
};
export const readBytesUntilLength = (
  ctx: Context,
  length: number
): number[] => {
  const bytes: number[] = [];
  for (let i = 0; i < length; i++) {
    const b = ctx.view.getUint8(ctx.offset);
    ctx.offset += 1;
    bytes.push(b);
  }
  return bytes;
};
