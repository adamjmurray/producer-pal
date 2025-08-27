// the entry point / loader script for the MCP server running inside Ableton Live via Node for Max
import Max from "max-api";
import { VERSION } from "../version";
import { createExpressApp } from "./create-express-app";
import * as console from "./node-for-max-logger";

let port = 3350;
const args = process.argv;

args.forEach((arg, index) => {
  if (arg === "port") {
    port = args[index + 1] ?? port;
  }
});

console.log(`Producer Pal ${VERSION} starting MCP server on port ${port}...`);

const appServer = createExpressApp();

appServer
  .listen(port, () => {
    const url = `http://localhost:${port}/mcp`;
    console.log(
      `Producer Pal ${VERSION} running.\nConnect Claude Desktop or another MCP client to ${url}`,
    );
    Max.outlet("version", VERSION);
  })
  .on("error", (error) => {
    throw new Error(
      error.code === "EADDRINUSE"
        ? `Producer Pal failed to start: Port ${port} is already in use.`
        : `Producer Pal failed to start: ${error}`,
    );
  });
