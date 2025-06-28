// dxt/server/bridge.js
console.error("[Bridge] Starting Producer Pal bridge using mcp-remote...");

import { spawn } from "child_process";

const config = JSON.parse(process.env.DXT_CONFIG || "{}");
const port = config.port || 3350;

console.error(`[Bridge] Configuration loaded - port: ${port}`);

// Use mcp-remote to proxy stdio to HTTP
const mcpRemoteUrl = `http://localhost:${port}/mcp`;
console.error(`[Bridge] Spawning mcp-remote for ${mcpRemoteUrl}`);

const mcpRemote = spawn("npx", ["mcp-remote", mcpRemoteUrl], {
  stdio: ["inherit", "inherit", "inherit"]
});

mcpRemote.on("close", (code) => {
  console.error(`[Bridge] mcp-remote exited with code ${code}`);
  process.exit(code);
});

mcpRemote.on("error", (error) => {
  console.error(`[Bridge] Failed to start mcp-remote: ${error.message}`);
  process.exit(1);
});

console.error("[Bridge] mcp-remote proxy started");