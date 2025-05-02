// device/index.mjs
// the entry point / loader script for the MCP server running inside Ableton Live via Node for Max
import Max from "max-api";
import { createServer } from "./server.ts";

const PORT = 3000;
const server = createServer(PORT);

Max.post("Reloaded on " + new Date());
