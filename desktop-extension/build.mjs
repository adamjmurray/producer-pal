// desktop-extension/build.mjs
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const folderName = basename(__dirname);

console.log("Building DXT bundle...");

console.log("Generating manifest.json...");

// Read version from root package.json
const rootPackageJson = JSON.parse(
  readFileSync(join(rootDir, "package.json"), "utf8"),
);
const version = rootPackageJson.version;

// Define tools (excluding development-only raw-live-api)
const tools = [
  {
    name: "transport",
    description:
      "Controls Arrangement and Session transport, playback, position, and loop settings",
  },
  {
    name: "create-clip",
    description: "Creates MIDI clips in Session or Arrangement view",
  },
  {
    name: "read-clip",
    description: "Reads information about clips including notes and properties",
  },
  {
    name: "update-clip",
    description: "Updates clip properties, notes, and settings",
  },
  { name: "create-track", description: "Creates new tracks in the Live Set" },
  {
    name: "read-track",
    description: "Reads information about tracks including clips and settings",
  },
  {
    name: "update-track",
    description: "Updates track properties like name, color, and settings",
  },
  {
    name: "capture-scene",
    description:
      "Captures existing clips from tracks into a new or existing scene",
  },
  { name: "create-scene", description: "Creates new scenes in Session view" },
  {
    name: "read-scene",
    description: "Reads information about scenes and their clips",
  },
  {
    name: "update-scene",
    description: "Updates scene properties like name and color",
  },
  {
    name: "read-song",
    description:
      "Reads comprehensive information about the Live Set including global settings and all tracks",
  },
  {
    name: "update-song",
    description:
      "Updates global song settings like tempo, time signature, and scales",
  },
  {
    name: "duplicate",
    description: "Duplicates objects between Session and Arrangement views",
  },
  {
    name: "delete",
    description: "Deletes various objects (tracks, clips, scenes)",
  },
];

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
  join(__dirname, "manifest-template.json"),
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
writeFileSync(join(__dirname, "manifest.json"), manifest);
console.log(
  `Generated manifest.json with version ${version} and ${tools.length} tools`,
);

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
