// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { logger } from "./file-logger.ts";
import { StdioHttpBridge } from "./stdio-http-bridge.ts";

// Main execution function
const mcpServerOrigin =
  process.env.MCP_SERVER_ORIGIN ?? "http://localhost:3350";
const mcpUrl = `${mcpServerOrigin}/mcp`;
const smallModelMode = process.env.SMALL_MODEL_MODE === "true";

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
  logger.error(`Failed to start enhanced bridge: ${errorMessage(error)}`);
  process.exit(1);
}
