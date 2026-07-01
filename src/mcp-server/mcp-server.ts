// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// the entry point / loader script for the MCP server running inside Ableton Live via Node for Max
import Max from "max-api";
import { VERSION } from "#src/shared/config.ts";
import { checkForUpdate } from "#src/shared/version-check.ts";
import { createExpressApp } from "./create-express-app.ts";
import { registerGlobalContextNodeRoutes } from "./helpers/global-context-node-routes.ts";
import { registerLibraryRoutes } from "./live-library/library-routes.ts";
import * as console from "./node-for-max-logger.ts";

registerLibraryRoutes();
registerGlobalContextNodeRoutes();

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

const devFlags = [
  ["ENABLE_LIVE_API", process.env.ENABLE_LIVE_API],
  ["ENABLE_CODE_EXEC", process.env.ENABLE_CODE_EXEC],
  ["ENABLE_DEV_CORS", process.env.ENABLE_DEV_CORS],
].filter(([, value]) => value === "true");

if (devFlags.length > 0) {
  console.warn(
    `Producer Pal: dev-only flags enabled — do not use this build in production: ${devFlags
      .map(([name]) => name)
      .join(", ")}`,
  );
}

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

    void checkForUpdate(VERSION).then((update) => {
      if (update) {
        console.log(`Producer Pal update available: ${update.version}`);
        void Max.outlet("update_available", update.version);
      }
    });
  })
  .on("error", (error: ServerError) => {
    throw new Error(
      error.code === "EADDRINUSE"
        ? `Producer Pal failed to start: Port ${port} is already in use.`
        : `Producer Pal failed to start: ${error}`,
    );
  });
