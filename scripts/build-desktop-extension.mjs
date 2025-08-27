#!/usr/bin/env node
import { getDisplayName } from "@modelcontextprotocol/sdk/shared/metadataUtils.js";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createMcpServer } from "../src/mcp-server/create-mcp-server.js";

const DXT_FILENAME = "Producer_Pal.dxt";

const server = createMcpServer();

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const desktopExtensionDir = join(rootDir, "desktop-extension");

console.log("Building DXT bundle...");

console.log("Generating manifest.json...");

// Read version from root package.json
const rootPackageJson = JSON.parse(
  readFileSync(join(rootDir, "package.json"), "utf8"),
);
const version = rootPackageJson.version;

// Generate tools from MCP server (excluding development-only ppal-raw-live-api)
const tools = [];

// User-facing descriptions for tools in the desktop extension manifest
// These are crisp, concise descriptions for end users, unlike the detailed
// LLM-facing descriptions in the MCP tool definitions
const toolDescriptions = {
  "ppal-init":
    "Initialize connection to Ableton Live and get basic Live Set information",
  "ppal-transport":
    "Controls Arrangement and Session transport, playback, position, and loop settings",
  "ppal-create-clip": "Creates MIDI clips in Session or Arrangement view",
  "ppal-read-clip":
    "Reads information about clips including notes and properties",
  "ppal-update-clip": "Updates clip properties, notes, and settings",
  "ppal-create-track": "Creates new tracks in the Live Set",
  "ppal-read-track":
    "Reads information about tracks including clips and settings",
  "ppal-update-track":
    "Updates track properties like name, color, and settings",
  "ppal-capture-scene":
    "Captures existing clips from tracks into a new or existing scene",
  "ppal-create-scene": "Creates new scenes in Session view",
  "ppal-read-scene": "Reads information about scenes and their clips",
  "ppal-update-scene": "Updates scene properties like name and color",
  "ppal-read-song":
    "Reads comprehensive information about the Live Set including global settings and all tracks",
  "ppal-update-song":
    "Updates global song settings like tempo, time signature, and scales",
  "ppal-read-view": "Reads the current view state in Ableton Live",
  "ppal-update-view": "Updates the view state in Ableton Live",
  "ppal-read-device": "Reads information about devices in Ableton Live",
  "ppal-duplicate": "Duplicates objects between Session and Arrangement views",
  "ppal-delete": "Deletes various objects (tracks, clips, scenes)",
  "ppal-memory": "Manages user-defined project notes for Producer Pal",
};

for (const [name, toolInfo] of Object.entries(server._registeredTools)) {
  if (name === "ppal-raw-live-api") continue; // Skip development-only tool

  tools.push({
    name: getDisplayName(toolInfo) || name,
    description: toolDescriptions[name],
  });
}

// Create readable long description
const longDescription = `Requires Ableton Live 12.2 or higher with Max for Live (Ableton Live Suite, or another edition of Live + the Max for Live add-on).

Add the Producer Pal Max for Live device (the Producer_Pal.amxd file) to an Ableton Live project. It must be added to a MIDI track and it's recommended you add it to a dedicated track (rather than a track with an instrument you want to play). Then ask Claude Desktop (with this extension enabled): "Let's play with Ableton Live".

This software is not affiliated with Ableton, Cycling '74, or Anthropic.`;

// Read template and replace placeholders
const template = readFileSync(
  join(__dirname, "desktop-extension-manifest.template.json"),
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

console.log("Packing DXT...");
execSync(
  `npx @anthropic-ai/dxt pack desktop-extension desktop-extension/${DXT_FILENAME.replace(" ", "\\ ")}`,
  { cwd: rootDir, stdio: "inherit" },
);
console.log("DXT packed successfully!");

console.log(`✓ Desktop extension built: desktop-extension/${DXT_FILENAME}`);
