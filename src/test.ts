import fs from "fs";
import { parse, tryAllFilters } from "./lib/sync";
import { requestPixelStream } from "./lib/stream";

(async () => {
  const files = fs.readdirSync("assets");
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
          }
          console.log(`  ${chunk.type}`);
        }
      }
      console.log(
        `  data size: ${compressedDataSize} -> ${uncompressedDataSize}`
      );
      console.log(`  sync: ${end - start}ms`);
    }
    {
      const data = fs.readFileSync(filePath);
      await tryAllFilters(data.buffer);
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
