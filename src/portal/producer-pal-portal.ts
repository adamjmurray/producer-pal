// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { logger } from "./file-logger.ts";
import { parsePortalArgs } from "./portal-args.ts";
import { StdioHttpBridge } from "./stdio-http-bridge.ts";
import { formatToolListing } from "./tool-listing.ts";

const { mcpUrl, bridgeOptions, listTools } = parsePortalArgs(
  process.argv.slice(2),
  process.env,
);

// --list-tools is a terminal query, not a session. Print and exit before the
// bridge starts, because from then on stdout is the MCP protocol channel.
if (listTools) {
  console.log(await formatToolListing(mcpUrl, bridgeOptions));
  process.exit(0);
}

logger.info(`Starting Producer Pal bridge (mcpUrl ${mcpUrl})`);

const bridge = new StdioHttpBridge(mcpUrl, bridgeOptions);

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
