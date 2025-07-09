// src/desktop-extension/claude-ableton-connector.js
import { StdioHttpBridge } from "./stdio-http-bridge.js";

// Main execution function
const port = process.env.PRODUCER_PAL_PORT || 3350;
const httpUrl = `http://localhost:${port}/mcp`;

console.error(`[Bridge] Starting Producer Pal bridge (port ${port})`);

const bridge = new StdioHttpBridge(httpUrl);

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
