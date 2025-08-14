// src/desktop-extension/claude-ableton-connector.js
import { StdioHttpBridge } from "./stdio-http-bridge.js";
import { logger } from "./file-logger.js";

// Main execution function
const mcpServerOrigin =
  process.env.MCP_SERVER_ORIGIN || "http://localhost:3350";
const mcpUrl = `${mcpServerOrigin}/mcp`;

logger.info(`Starting Producer Pal bridge (mcpUrl ${mcpUrl})`);

const bridge = new StdioHttpBridge(mcpUrl);

// Handle graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down...");
  await bridge.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down...");
  await bridge.stop();
  process.exit(0);
});

// Start the bridge - this should always succeed now
bridge.start().catch((error) => {
  logger.error(`Failed to start enhanced bridge: ${error.message}`);
  process.exit(1);
});
