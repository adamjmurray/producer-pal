// tools/build-desktop-extension.mjs
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createMcpServer } from "../src/mcp-server/create-mcp-server.js";
import { toolDescriptions } from "./tool-descriptions.js";

const DXT_FILENAME = "Producer Pal.dxt";

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

// Generate tools from MCP server (excluding development-only raw-live-api)
const tools = [];

for (const [name, toolInfo] of Object.entries(server._registeredTools)) {
  if (name === "raw-live-api") continue; // Skip development-only tool

  tools.push({
    name,
    description: toolDescriptions[name] || toolInfo.description,
  });
}

// Create readable long description
const longDescription = `# Setup

The Producer Pal Max for Live device MUST be running in Ableton Live for this extension to work. See setup instructions at [adammurray.link](https://adammurray.link)

_If you install the extension or start Claude Desktop before Ableton Live + the Producer Pal device, restart Claude Desktop or turn this extension off and back on to connect to Ableton Live._

# Usage

 • Start a chat like:

 > Let's play with Ableton Live

 • Create a track called "Drums" with a drum rack and ask:

 > Generate a 4-bar drum loop

 • Create a track called "Chords" with an instrument and ask:

 > Generate a 4-chord progression of whole notes

 • Then, with a "Bass" track, ask:

 > Generate a bassline to go along with the chords

 • Ask the AI what it can do:

 > What are all the things you can do with your Ableton Live tools
 `;

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
