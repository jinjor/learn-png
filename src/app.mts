import { parse } from "./parse";
import { pixelStream } from "./parse2";

const button1 = document.getElementById("button1")!;
button1.onclick = async () => {
  const img = document.getElementById("img") as HTMLImageElement;
  const src = img.src;

  const start = Date.now();

  const res = await fetch(src);
  const binary = await res.arrayBuffer();

  const parsed = await parse(binary);
  const width = parsed[0].length;
  const height = parsed.length;

  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d")!;
  for (let y = 0; y < height; y++) {
    const row = parsed[y];
    for (let x = 0; x < width; x++) {
      const pixel = row[x];
      const color = `rgb(${pixel.r}, ${pixel.g}, ${pixel.b})`;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  console.log("time1:", Date.now() - start);
};

const button2 = document.getElementById("button2")!;
button2.onclick = async () => {
  const img = document.getElementById("img") as HTMLImageElement;
  const src = img.src;

  const start = Date.now();

  const res = await fetch(src);

  const canvas = document.getElementById("canvas") as HTMLCanvasElement;

  // TODO
  // canvas.width = 640;
  // canvas.height = 384;

  canvas.width = 2620;
  canvas.height = 1856;

  const ctx = canvas.getContext("2d")!;

  let y = 0;
  for await (const row of pixelStream(bufferStream(res.body!))) {
    for (let x = 0; x < row.length; x++) {
      const pixel = row[x];
      const color = `rgb(${pixel.r}, ${pixel.g}, ${pixel.b})`;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
    y++;
  }
  console.log("time2:", Date.now() - start);
};

async function* bufferStream(stream: ReadableStream<Uint8Array>) {
  // const reader = new ReadableStream<Uint8Array>(
  //   stream,
  //   new ByteLengthQueuingStrategy({
  //     highWaterMark: 1 * 1024,
  //   })
  // ).getReader();
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    yield value;
  }
}
