import { parse } from "./parse";

const res = await fetch("./assets/example.png");
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
