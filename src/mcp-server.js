// src/mcp-server.js
// the entry point / loader script for the MCP server running inside Ableton Live via Node for Max
import Max from "max-api";
import { createExpressApp } from "./mcp-server/create-express-app";
import { DEFAULT_LIVE_API_CALL_TIMEOUT_MS } from "./mcp-server/max-api-adapter";
import * as console from "./mcp-server/node-for-max-logger";
import { VERSION } from "./version";

let port = 3350;
let timeoutMs = DEFAULT_LIVE_API_CALL_TIMEOUT_MS;
const args = process.argv;

args.forEach((arg, index) => {
  if (arg === "port") {
    port = args[index + 1] ?? port;
  }
  if (arg === "timeoutMs") {
    timeoutMs = Number.parseInt(args[index + 1]);
    if (Number.isNaN(timeoutMs)) timeoutMs = DEFAULT_LIVE_API_CALL_TIMEOUT_MS;
  }
});

console.log(
  `MCP Server v${VERSION} starting with port=${port}, Live API timeout=${timeoutMs}ms`,
);

const appServer = createExpressApp({ timeoutMs });

appServer
  .listen(port, () => {
    const url = `http://localhost:${port}/mcp`;
    console.log(`MCP Server running at ${url}`);
    Max.outlet("version", VERSION);
  })
  .on("error", (error) => {
    throw new Error(
      error.code === "EADDRINUSE"
        ? `Port ${port} is already in use.`
        : `Server error: ${error}`,
    );
  });
