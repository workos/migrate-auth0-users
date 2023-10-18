import fs from "fs";
import readline from "readline";

export async function* ndjsonStream(filePath: string): AsyncIterable<unknown> {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    yield JSON.parse(line);
  }
}
