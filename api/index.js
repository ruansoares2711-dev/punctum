import { readFileSync } from "fs";
import { resolve } from "path";

const indexContent = readFileSync(resolve(__dirname, "../dist/server/index.js"), "utf-8");

export default eval(indexContent);
