// tools/prepare-dxt.mjs
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const dxtDir = join(rootDir, "producer-pal");

console.log("Preparing DXT bundle...");

// Install and bundle mcp-remote dependency
console.log("Installing mcp-remote in DXT server directory...");

import { execSync } from "child_process";

// Install mcp-remote in the DXT server directory
const serverDir = join(dxtDir, "server");
try {
  execSync("npm install", { cwd: serverDir, stdio: "inherit" });
  console.log("mcp-remote installed successfully in DXT bundle");

  // Verify mcp-remote script exists where bridge.js expects it
  const mcpRemoteScript = join(
    serverDir,
    "node_modules",
    "mcp-remote",
    "dist",
    "proxy.js",
  );
  if (existsSync(mcpRemoteScript)) {
    console.log("mcp-remote script found at expected location");
  } else {
    console.error(`ERROR: mcp-remote script not found at ${mcpRemoteScript}`);
    process.exit(1);
  }
} catch (error) {
  console.error("Failed to install mcp-remote:", error.message);
  process.exit(1);
}

console.log("DXT preparation complete!");
