import fs from "fs";
import { parse } from "./parse";

const filePath = process.argv[2];
const outDir = "./out";

const data = fs.readFileSync(filePath);

parse(data.buffer)
  .then((parsed) => {
    console.log(parsed[0].length, parsed.length);
    console.log("done");
  })
  .catch((err) => {
    console.error(err);
  });
