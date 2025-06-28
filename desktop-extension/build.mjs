// desktop-extension/build.mjs
import { execSync } from "child_process";
import { existsSync } from "fs";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const folderName = basename(__dirname);

console.log("Building DXT bundle...");

console.log("Installing dependencies...");
execSync("npm install", { cwd: __dirname, stdio: "inherit" });
console.log("Dependencies installed successfully");

// Verify mcp-remote script exists where server.js expects it
const mcpRemoteScript = join(
  __dirname,
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

console.log("Packing DXT...");
execSync(
  `npx @anthropic-ai/dxt pack ${folderName} ${folderName}/Producer\\ Pal.dxt`,
  { cwd: rootDir, stdio: "inherit" },
);
console.log("DXT packed successfully!");

console.log("DXT build complete!");
