import { errorMessage } from "#src/shared/error-utils.js";
import { logger } from "./file-logger.js";
import { StdioHttpBridge } from "./stdio-http-bridge.js";

// Main execution function
const mcpServerOrigin =
  process.env.MCP_SERVER_ORIGIN ?? "http://localhost:3350";
const mcpUrl = `${mcpServerOrigin}/mcp`;

logger.info(`Starting Producer Pal bridge (mcpUrl ${mcpUrl})`);

const bridge = new StdioHttpBridge(mcpUrl);

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
