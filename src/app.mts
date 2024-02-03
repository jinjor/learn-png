import { parse } from "./sync";
import { requestPixelStream } from "./stream";

const button1 = document.getElementById("button1")!;
button1.onclick = async () => {
  const img = document.getElementById("img") as HTMLImageElement;
  const src = img.src + "?" + Date.now();

  const start = Date.now();

  const res = await fetch(src);
  const binary = await res.arrayBuffer();

  const { pixels } = await parse(binary);
  const width = pixels[0].length;
  const height = pixels.length;

  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d")!;
  for (let y = 0; y < height; y++) {
    const row = pixels[y];
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
  const src = img.src + "?" + Date.now();

  const start = Date.now();

  const res = await fetch(src);

  const canvas = document.getElementById("canvas") as HTMLCanvasElement;

  const { head, body } = await requestPixelStream(bufferStream(res.body!));

  canvas.width = head.width;
  canvas.height = head.height;

  const ctx = canvas.getContext("2d")!;

  for await (const { pixels, interpolation } of body) {
    console.log(interpolation?.interlaceIndex);
    for (const { x, y, color } of pixels) {
      ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
      ctx.fillRect(x, y, interpolation?.spanX ?? 1, interpolation?.spanY ?? 1);
    }
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
