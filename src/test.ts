import fs from "fs";
import { parse } from "./lib/sync";
import { requestPixelStream } from "./lib/stream";
import { parse as parseICC } from "icc";
import pako from "pako";

const args = process.argv.slice(2).filter((v) => !v.startsWith("-"));
const options = process.argv.slice(2).filter((v) => v.startsWith("-"));
const target = args[0] && args[0].split("/").at(-1);
const showDetail = options.includes("--detail");

(async () => {
  const files = target ? [target] : fs.readdirSync("assets");

  for (const file of files) {
    if (!file.endsWith(".png")) {
      continue;
    }
    const filePath = `assets/${file}`;
    console.log(file);
    {
      const start = Date.now();
      const data = fs.readFileSync(filePath);
      const { chunks, pixels, compressedDataSize, uncompressedDataSize } =
        await parse(data.buffer);
      let i = 0;
      for (const row of pixels) {
        i++;
      }
      const end = Date.now();
      let idatCount = 0;
      for (const chunk of chunks) {
        if (chunk.type === "IDAT") {
          idatCount++;
          process.stdout.write(`\r  ${chunk.type} x${idatCount}`);
        } else {
          if (idatCount > 0) {
            console.log();
            idatCount = 0;
          }
          console.log(`  ${chunk.type}`);
          if (!showDetail) {
            continue;
          }
          console.log(chunk);
          if (chunk.type === "iCCP" && !("unknown" in chunk)) {
            const data = pako.inflate(chunk.compressedProfile);
            const profile = parseICC(Buffer.from(data));
            console.log(profile);
          } else if (chunk.type === "eXIf" && !("unknown" in chunk)) {
            if (chunk.data.GPSLatitudeRef && chunk.data.GPSLatitude) {
              const lat = chunk.data.GPSLatitude.reduce((acc, v, i) => {
                return acc + v / Math.pow(60, i);
              }, 0);
              console.log(`  GPSLatitude: ${chunk.data.GPSLatitudeRef} ${lat}`);
            }
            if (chunk.data.GPSLongitudeRef && chunk.data.GPSLongitude) {
              const lon = chunk.data.GPSLongitude.reduce((acc, v, i) => {
                return acc + v / Math.pow(60, i);
              }, 0);
              console.log(
                `  GPSLongitude: ${chunk.data.GPSLongitudeRef} ${lon}`
              );
            }
          }
        }
      }
      console.log(
        `  data size: ${compressedDataSize} -> ${uncompressedDataSize}`
      );
      console.log(`  sync: ${end - start}ms`);
    }
    {
      const data = fs.readFileSync(filePath);
      const { filterComparison } = await parse(data.buffer, { analyze: true });
      for (const [i, v] of filterComparison!.entries()) {
        console.log(`  filter${i}: ${v}`);
      }
    }
    {
      const start = Date.now();
      const stream = fs.createReadStream(filePath);
      let i = 0;
      const { head, body } = await requestPixelStream(stream);
      for await (const row of body) {
        i++;
      }
      console.log(`  stream: ${Date.now() - start}ms`);
    }
    {
      const start = Date.now();
      const stream = fs.createReadStream(filePath);
      let i = 0;
      const { head, body } = await requestPixelStream(stream);
      for await (const row of body) {
        i++;
        if (i === 1) {
          break;
        }
      }
      console.log(`  stream|1px: ${Date.now() - start}ms`);
    }
    console.log();
  }
})().catch((e) => {
  console.log(e);
  process.exit(1);
});
