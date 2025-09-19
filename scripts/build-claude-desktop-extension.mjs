#!/usr/bin/env node
import { getDisplayName } from "@modelcontextprotocol/sdk/shared/metadataUtils.js";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createMcpServer } from "../src/mcp-server/create-mcp-server.js";

const BUNDLE_FILENAME = "Producer_Pal.mcpb";

const server = createMcpServer();

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const desktopExtensionDir = join(rootDir, "claude-desktop-extension");

console.log("Building MCP bundle...");

console.log("Generating manifest.json...");

// Read version from root package.json
const rootPackageJson = JSON.parse(
  readFileSync(join(rootDir, "package.json"), "utf8"),
);
const version = rootPackageJson.version;

// Generate tools from MCP server (excluding development-only ppal-raw-live-api)
const tools = [];

for (const [name, toolInfo] of Object.entries(server._registeredTools)) {
  const shortDescription = toolInfo.description.split("\n")[0];
  tools.push({
    name: getDisplayName(toolInfo) || name,
    description: shortDescription,
  });
}

// Create readable long description
const longDescription = `Requires Ableton Live 12.2 or higher with Max for Live (Ableton Live Suite, or another edition of Live + the Max for Live add-on).

Add the Producer Pal Max for Live device (the Producer_Pal.amxd file) to an Ableton Live project. It must be added to a MIDI track and it's recommended you add it to a dedicated track (rather than a track with an instrument you want to play). Then ask Claude Desktop (with this extension enabled): "Let's play with Ableton Live".

This software is not affiliated with Ableton, Cycling '74, or Anthropic.`;

// Read template and replace placeholders
const template = readFileSync(
  join(__dirname, "..", "claude-desktop-extension", "manifest.template.json"),
  "utf8",
);
const manifest = template
  .replace(/"\{\{version\}\}"/g, JSON.stringify(version))
  .replace(
    /"\{\{tools\}\}"/g,
    JSON.stringify(tools, null, 2).replace(/\n/g, "\n  "),
  )
  .replace(/"\{\{long_description\}\}"/g, JSON.stringify(longDescription));

// Write generated manifest
writeFileSync(join(desktopExtensionDir, "manifest.json"), manifest);
console.log(
  `Generated manifest.json with version ${version} and ${tools.length} tools`,
);

console.log("Installing dependencies...");
execSync("npm install", { cwd: desktopExtensionDir, stdio: "inherit" });
console.log("Dependencies installed successfully");

console.log("Packing MCP bundle...");
execSync(
  `npx @anthropic-ai/mcpb pack claude-desktop-extension claude-desktop-extension/${BUNDLE_FILENAME.replace(" ", "\\ ")}`,
  { cwd: rootDir, stdio: "inherit" },
);
console.log("MCP bundle packed successfully!");

console.log(
  `✓ Desktop extension built: claude-desktop-extension/${BUNDLE_FILENAME}`,
);
