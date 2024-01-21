import fs from "fs";
import { parse } from "./parse";
import { chunkStream, pixelStream, rowStream, unzippedStream } from "./parse2";

const filePath = process.argv[2];

// (async () => {
//   const start = Date.now();
//   const data = fs.readFileSync(filePath);
//   const parsed = await parse(data.buffer);

//   let i = 0;
//   for (const row of parsed) {
//     // console.log(i, row);
//     i++;
//     if (i === 10) {
//       break;
//     }
//   }
//   console.log("time:", Date.now() - start);
// })().catch((e) => {
//   console.error(e.message);
//   process.exit(1);
// });

(async () => {
  const start = Date.now();
  const stream = fs.createReadStream(filePath);
  let i = 0;
  for await (const row of pixelStream(stream)) {
    // console.log(i, row);
    i++;
    // if (i === 10) {
    //   break;
    // }
  }
  console.log("time:", Date.now() - start);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
