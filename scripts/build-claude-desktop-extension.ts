#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDisplayName } from "@modelcontextprotocol/sdk/shared/metadataUtils.js";
import type { CallLiveApiFunction } from "../src/mcp-server/create-mcp-server.ts";
import { createMcpServer } from "../src/mcp-server/create-mcp-server.ts";

const BUNDLE_FILENAME = "Producer_Pal.mcpb";

const server = createMcpServer(null as unknown as CallLiveApiFunction);

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
const tools: { name: string; description: string }[] = [];

interface RegisteredTool {
  name: string;
  description: string;
  annotations?: { title?: string };
}

const registeredTools = (
  server as unknown as { _registeredTools: Record<string, RegisteredTool> }
)._registeredTools;

for (const [name, toolInfo] of Object.entries(registeredTools)) {
  const shortDescription = toolInfo.description.split("\n")[0] ?? "";

  tools.push({
    name: getDisplayName(toolInfo) || name,
    description: shortDescription,
  });
}

// Read template and replace placeholders
const template = readFileSync(
  join(__dirname, "..", "claude-desktop-extension", "manifest.template.json"),
  "utf8",
);
const manifest = template
  .replaceAll('"{{version}}"', JSON.stringify(version))
  .replaceAll(
    '"{{tools}}"',
    JSON.stringify(tools, null, 2).replaceAll("\n", "\n  "),
  );

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
