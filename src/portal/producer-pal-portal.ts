// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { logger } from "./file-logger.ts";
import { StdioHttpBridge } from "./stdio-http-bridge.ts";

// Main execution function
// Strip trailing slashes from the origin so a value like
// "http://localhost:3350/" doesn't produce "http://localhost:3350//mcp" (404).
const mcpServerOrigin = (
  process.env.MCP_SERVER_ORIGIN ?? "http://localhost:3350"
).replace(/\/+$/, "");
const mcpUrl = `${mcpServerOrigin}/mcp`;
const args = new Set(process.argv.slice(2));
const smallModelMode =
  args.has("-s") ||
  args.has("--small-model-mode") ||
  process.env.SMALL_MODEL_MODE === "true";

logger.info(`Starting Producer Pal bridge (mcpUrl ${mcpUrl})`);

const bridge = new StdioHttpBridge(mcpUrl, { smallModelMode });

// Handle graceful shutdown
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down...");
  void bridge.stop().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down...");
  void bridge.stop().then(() => process.exit(0));
});

// Start the bridge - this should always succeed
try {
  await bridge.start();
} catch (error) {
  logger.error(`Failed to start bridge: ${errorMessage(error)}`);
  process.exit(1);
}
