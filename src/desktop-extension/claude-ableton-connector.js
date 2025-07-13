// src/desktop-extension/claude-ableton-connector.js
import { StdioHttpBridge } from "./stdio-http-bridge.js";

// Main execution function
const mcpServerOrigin =
  process.env.MCP_SERVER_ORIGIN || "http://localhost:3350";
const mcpUrl = `${mcpServerOrigin}/mcp`;
const verboseLogging = process.env.VERBOSE_LOGGING === "true";

console.error(`[Bridge] Starting Producer Pal bridge (mcpUrl ${mcpUrl})`);

const bridge = new StdioHttpBridge(mcpUrl, { verbose: verboseLogging });

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.error("[Bridge] Received SIGINT, shutting down...");
  await bridge.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.error("[Bridge] Received SIGTERM, shutting down...");
  await bridge.stop();
  process.exit(0);
});

// Start the bridge - this should always succeed now
bridge.start().catch((error) => {
  console.error(`[Bridge] Failed to start enhanced bridge: ${error.message}`);
  process.exit(1);
});
