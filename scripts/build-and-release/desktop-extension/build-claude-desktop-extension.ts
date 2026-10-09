#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MCP_ORIGIN, DEFAULT_MCP_PORT } from "#src/shared/config.ts";
import { getManifestTools } from "./desktop-extension-tools.ts";

const BUNDLE_FILENAME = "Producer_Pal.mcpb";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../../..");
const desktopExtensionDir = join(rootDir, "claude-desktop-extension");

console.log("Building MCP bundle...");

console.log("Generating manifest.json...");

// Read version from root package.json
const rootPackageJson = JSON.parse(
  readFileSync(join(rootDir, "package.json"), "utf8"),
);
const version = rootPackageJson.version;

// Generate tools from MCP server (excluding development-only ppal-live-api)
const tools = getManifestTools();

// Read template and replace placeholders
const template = readFileSync(
  join(rootDir, "claude-desktop-extension", "manifest.template.json"),
  "utf8",
);
const manifest = template
  .replaceAll('"{{version}}"', JSON.stringify(version))
  .replaceAll("{{origin}}", DEFAULT_MCP_ORIGIN)
  .replaceAll("{{port}}", String(DEFAULT_MCP_PORT))
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
