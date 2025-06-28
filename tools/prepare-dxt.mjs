// tools/prepare-dxt.mjs
import { copyFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const dxtDir = join(rootDir, "producer-pal");

console.log("Preparing DXT bundle...");

// Ensure DXT directories exist
mkdirSync(join(dxtDir, "server"), { recursive: true });
mkdirSync(join(dxtDir, "server", "node_modules"), { recursive: true });

// Copy static files
console.log("Copying static files...");
copyFileSync(join(rootDir, "LICENSE.md"), join(dxtDir, "LICENSE.md"));
copyFileSync(join(rootDir, "README.md"), join(dxtDir, "README.md"));

// Create icon.png if it doesn't exist (placeholder)
const iconPath = join(dxtDir, "icon.png");
if (!existsSync(iconPath)) {
  console.log("Creating placeholder icon...");
  // Create a simple 256x256 PNG placeholder
  writeFileSync(
    iconPath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
}

// Install and bundle mcp-remote dependency
console.log("Installing mcp-remote in DXT server directory...");

import { execSync } from "child_process";

// Install mcp-remote in the DXT server directory
const serverDir = join(dxtDir, "server");
try {
  execSync("npm install", { cwd: serverDir, stdio: "inherit" });
  console.log("mcp-remote installed successfully in DXT bundle");

  // Verify mcp-remote script exists where bridge.js expects it
  const mcpRemoteScript = join(serverDir, "node_modules", "mcp-remote", "dist", "proxy.js");
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
