export const typedArrayToArrayBuffer = (array: Uint8Array): ArrayBuffer => {
  return array.buffer.slice(
    array.byteOffset,
    array.byteLength + array.byteOffset
  );
};

export const concatArrayBuffers = (bufs: ArrayBuffer[]): ArrayBuffer => {
  const totalLength = bufs.reduce((acc, buf) => acc + buf.byteLength, 0);
  const concatBuf = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of bufs) {
    concatBuf.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return concatBuf.buffer;
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
    let resolveInner: (() => void) | undefined;
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
    let resolved = false;
    const emitter = {
      error: (e: Error) => {
        if (!resolved) {
          reject(e);
        }
        done = true;
      },
      data: (data: T) => {
        results.push(data);
        resolveInner?.();
        promise = new Promise<void>((r) => {
          resolveInner = r;
        });
      },
      start: (head: H) => {
        resolve({
          head: head,
          body: newStream(),
        });
        resolved = true;
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
      done = true;
      resolveInner?.();
    })();
  });
};
