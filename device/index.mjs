// device/index.mjs
import Max from "max-api";
import { createServer } from "./server.ts";

const PORT = 3000;
const server = createServer(PORT);

Max.post("Reloaded on " + new Date());
