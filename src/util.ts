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
  // const str: string[] = [];
  // for (let i = 0; i < length; i++) {
  //   const c = ctx.view.getUint8(ctx.offset);
  //   ctx.offset += 1;
  //   str.push(String.fromCharCode(c));
  // }
  // return str.join("");

  const offset = ctx.view.byteOffset + ctx.offset;
  const str = new TextDecoder().decode(
    ctx.view.buffer.slice(offset, offset + length)
  );
  ctx.offset += length;
  return str;
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

export const concatBuffers = (bufs: Uint8Array[]): Uint8Array => {
  const totalLength = bufs.reduce((acc, buf) => acc + buf.length, 0);
  const concatBuf = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of bufs) {
    concatBuf.set(buf, offset);
    offset += buf.length;
  }
  return concatBuf;
};

export const splitIterable = <H, S, T>(
  stream: AsyncIterable<S>,
  handle: (
    emitter: {
      error: (e: Error) => void;
      data: (data: T) => void;
      start: (header: H) => void;
      end: () => void;
    },
    src: S
  ) => void
): Promise<{
  head: H;
  body: AsyncIterable<T>;
}> => {
  return new Promise((resolve, reject) => {
    let resolveInner: () => void;
    let promise = new Promise<void>((r) => {
      resolveInner = r;
    });
    let done = false;
    let results: T[] = [];

    async function* newStream() {
      while (!done) {
        await promise;
        yield* results;
        results = [];
      }
    }

    const eventTarget = new EventTarget();
    let resolved = false;
    eventTarget.addEventListener("start", (data: any) => {
      resolve({
        head: data.detail,
        body: newStream(),
      });
      resolved = true;
    });
    eventTarget.addEventListener("data", (data: any) => {
      results.push(data.detail);
      resolveInner();
      promise = new Promise<void>((r) => {
        resolveInner = r;
      });
    });
    eventTarget.addEventListener("end", (data: any) => {
      done = true;
      resolveInner();
    });
    const emitter = {
      error: (e: Error) => {
        if (!resolved) {
          reject(e);
        }
        done = true;
      },
      data: (data: T) => {
        eventTarget.dispatchEvent(new CustomEvent("data", { detail: data }));
      },
      start: (header: H) => {
        eventTarget.dispatchEvent(new CustomEvent("start", { detail: header }));
      },
      end: () => {
        done = true;
      },
    };
    (async () => {
      for await (const src of stream) {
        handle(emitter, src);
        if (done) {
          break;
        }
      }
      eventTarget.dispatchEvent(new CustomEvent("end", { detail: null }));
    })();
  });
};
