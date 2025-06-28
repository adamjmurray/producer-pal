// desktop-extension/server.js
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = JSON.parse(process.env.DXT_CONFIG || "{}");
const port = config.port || 3350;
const mcpRemoteUrl = `http://localhost:${port}/mcp`;

console.error(`[Bridge] Starting Producer Pal bridge (port ${port})`);

// Use bundled mcp-remote script
const mcpRemoteScript = join(__dirname, "node_modules", "mcp-remote", "dist", "proxy.js");

if (!existsSync(mcpRemoteScript)) {
  console.error(`[Bridge] ERROR: mcp-remote script not found at ${mcpRemoteScript}`);
  process.exit(1);
}

const command = "node";
const args = [mcpRemoteScript, mcpRemoteUrl];

console.error(`[Bridge] Spawning: ${command} ${args.join(' ')}`);

const mcpRemote = spawn(command, args, {
  stdio: "inherit",
  cwd: __dirname,
  shell: false
});

mcpRemote.on("close", (code) => {
  console.error(`[Bridge] mcp-remote exited with code ${code}`);
  process.exit(code);
});

mcpRemote.on("error", (error) => {
  console.error(`[Bridge] Failed to start mcp-remote: ${error.message}`);
  process.exit(1);
});
