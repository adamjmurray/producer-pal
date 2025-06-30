// tools/build-desktop-extension.mjs
import { getDisplayName } from "@modelcontextprotocol/sdk/shared/metadataUtils.js";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createMcpServer } from "../src/mcp-server/create-mcp-server.js";

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

// User-facing descriptions for tools in the desktop extension manifest
// These are crisp, concise descriptions for end users, unlike the detailed
// LLM-facing descriptions in the MCP tool definitions
const toolDescriptions = {
  transport:
    "Controls Arrangement and Session transport, playback, position, and loop settings",
  "create-clip": "Creates MIDI clips in Session or Arrangement view",
  "read-clip": "Reads information about clips including notes and properties",
  "update-clip": "Updates clip properties, notes, and settings",
  "create-track": "Creates new tracks in the Live Set",
  "read-track": "Reads information about tracks including clips and settings",
  "update-track": "Updates track properties like name, color, and settings",
  "capture-scene":
    "Captures existing clips from tracks into a new or existing scene",
  "create-scene": "Creates new scenes in Session view",
  "read-scene": "Reads information about scenes and their clips",
  "update-scene": "Updates scene properties like name and color",
  "read-song":
    "Reads comprehensive information about the Live Set including global settings and all tracks",
  "update-song":
    "Updates global song settings like tempo, time signature, and scales",
  duplicate: "Duplicates objects between Session and Arrangement views",
  delete: "Deletes various objects (tracks, clips, scenes)",
};

for (const [name, toolInfo] of Object.entries(server._registeredTools)) {
  if (name === "raw-live-api") continue; // Skip development-only tool

  tools.push({
    name: getDisplayName(toolInfo) || name,
    description: toolDescriptions[name],
  });
}

// Create readable long description
const longDescription = `# Setup

Requires Ableton Live 12.2 or higher with Max for Live (Ableton Live Suite or another edition with the Max for Live add-on).

The Producer Pal Max for Live device MUST be running in Ableton Live for this extension to work. See the [the Producer Pal setup instructions](https://adammurray.link/producer-pal/)

_If you install the extension or start Claude Desktop before Ableton Live + the Producer Pal device, restart Claude Desktop or turn this extension off and back on to connect to Ableton Live (this will be improved in upcoming versions)._

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
