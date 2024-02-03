import fs from "fs";
import { parse } from "./sync";
import { requestPixelStream } from "./stream";

(async () => {
  const files = fs.readdirSync("assets");
  for (const file of files) {
    const filePath = `assets/${file}`;
    console.log(file);
    {
      const start = Date.now();
      const data = fs.readFileSync(filePath);
      const { pixels, compressedDataSize, uncompressedDataSize } = await parse(
        data.buffer
      );
      let i = 0;
      for (const row of pixels) {
        i++;
      }
      console.log(
        `  data size: ${compressedDataSize} -> ${uncompressedDataSize}`
      );
      console.log(`  sync: ${Date.now() - start}ms`);
    }
    if (file.includes("interlace")) {
      continue;
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
  }
})().catch((e) => {
  console.log(e);
  process.exit(1);
});
