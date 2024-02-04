import React from "react";
import { parse } from "../lib/sync";
import { requestPixelStream } from "../lib/stream";

export const App = () => {
  const images = [
    "./assets/sd.png",
    "./assets/sd_x.png",
    "./assets/mac_ss.png",
    "./assets/mac_ss_large.png",
    "./assets/mac_ss_large_interlace.png",
  ];
  const [selected, setSelected] = React.useState(images[0]);
  return (
    <>
      <select onChange={(e) => setSelected(e.target.value)}>
        {images.map((imagePath, i) => (
          <option key={i}>{imagePath}</option>
        ))}
      </select>
      <hr></hr>
      <Item key={selected} imagePath={selected} />
    </>
  );
};

const Item = ({ imagePath }: { imagePath: string }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const handleClickRead = async () => {
    const canvas = canvasRef.current!;
    const src = imagePath + "?" + Date.now();
    const start = Date.now();
    await fetchAndDrawSync(src, canvas);
    console.log("time1:", Date.now() - start);
  };
  const handleClickReadStream = async () => {
    const canvas = canvasRef.current!;
    const src = imagePath + "?" + Date.now();
    const start = Date.now();
    await fetchAndDrawStream(src, canvas);
    console.log("time2:", Date.now() - start);
  };
  return (
    <>
      <div style={{ display: "flex", gap: 10, width: "100%" }}>
        <img src={imagePath} style={{ width: "0%", flexGrow: 1 }} />
        <canvas ref={canvasRef} style={{ width: "0%", flexGrow: 1 }}></canvas>
      </div>
      <button onClick={handleClickRead}>Read</button>
      <button onClick={handleClickReadStream}>Read (stream)</button>
    </>
  );
};

const fetchAndDrawSync = async (src: string, canvas: HTMLCanvasElement) => {
  const res = await fetch(src);
  const binary = await res.arrayBuffer();
  const { pixels } = await parse(binary);
  const width = pixels[0].length;
  const height = pixels.length;
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
};

const fetchAndDrawStream = async (src: string, canvas: HTMLCanvasElement) => {
  const res = await fetch(src);
  const { head, body } = await requestPixelStream(bufferStream(res.body!));
  canvas.width = head.width;
  canvas.height = head.height;
  const ctx = canvas.getContext("2d")!;
  for await (const { pixels, interpolation } of body) {
    for (const { x, y, color } of pixels) {
      ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
      ctx.fillRect(x, y, interpolation?.spanX ?? 1, interpolation?.spanY ?? 1);
    }
  }
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
