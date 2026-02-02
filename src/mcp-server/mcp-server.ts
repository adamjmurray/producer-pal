// the entry point / loader script for the MCP server running inside Ableton Live via Node for Max
import Max from "max-api";
import { VERSION } from "#src/shared/version.ts";
import { createExpressApp } from "./create-express-app.ts";
import * as console from "./node-for-max-logger.ts";

interface ServerError extends Error {
  code?: string;
}

// Cast process to access Node.js argv (max-globals.d.ts has limited process type)
const args = (process as unknown as { argv: string[] }).argv;

let port = 3350;

for (const [index, arg] of args.entries()) {
  if (arg === "port") {
    const portValueArg = args[index + 1];

    if (portValueArg == null) {
      throw new Error("Missing port value");
    }

    port = Number.parseInt(portValueArg);

    if (Number.isNaN(port)) {
      throw new Error(`Invalid port: ${portValueArg}`);
    }
  }
}

console.log(`Producer Pal ${VERSION} starting MCP server on port ${port}...`);

const appServer = createExpressApp();

appServer
  .listen(port, () => {
    const url = `http://localhost:${port}/mcp`;

    console.log(
      `Producer Pal ${VERSION} running.\nConnect Claude Desktop or another MCP client to ${url}`,
    );
    void Max.outlet("version", VERSION);

    // We need to use our own started event because the Node for Max started
    // occurs too early, before our message handlers are registered.
    void Max.outlet("started");
  })
  .on("error", (error: ServerError) => {
    throw new Error(
      error.code === "EADDRINUSE"
        ? `Producer Pal failed to start: Port ${port} is already in use.`
        : `Producer Pal failed to start: ${error}`,
    );
  });
