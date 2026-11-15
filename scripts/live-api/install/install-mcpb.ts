#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Put the local extension build (claude-desktop-extension/Producer_Pal.mcpb,
 * made by `npm run build`) into Claude Desktop.
 *
 * Usage: npm run install:mcpb
 *
 * If it's installed, replaces the installed files and the manifest copy in
 * extensions-installations.json, since Claude Desktop won't reinstall the same
 * version. Otherwise opens the .mcpb in Claude Desktop to install it. Either
 * way, restart Claude Desktop (or toggle the extension) to load it.
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

interface Installations {
  extensions: Record<string, { version: string; manifest: { name: string } }>;
}

const rootDir = join(import.meta.dirname, "../../..");
const mcpbFile = join(rootDir, "claude-desktop-extension/Producer_Pal.mcpb");

if (!existsSync(mcpbFile)) {
  exit(`${mcpbFile} not found. Run \`npm run build\` first.`);
}

const claudeDir =
  process.platform === "darwin"
    ? join(homedir(), "Library/Application Support/Claude")
    : process.platform === "win32"
      ? join(
          process.env.APPDATA ?? join(homedir(), "AppData/Roaming"),
          "Claude",
        )
      : exit(`Claude Desktop doesn't run on ${process.platform}.`);

const installationsFile = join(claudeDir, "extensions-installations.json");
const installations = existsSync(installationsFile)
  ? (JSON.parse(readFileSync(installationsFile, "utf8")) as Installations)
  : { extensions: {} };

const unpackDir = mkdtempSync(join(tmpdir(), "producer-pal-mcpb-"));

try {
  execFileSync("npx", ["mcpb", "unpack", mcpbFile, unpackDir], {
    cwd: rootDir,
    stdio: "ignore",
    shell: process.platform === "win32",
  });

  const manifest = JSON.parse(
    readFileSync(join(unpackDir, "manifest.json"), "utf8"),
  ) as { name: string; version: string };

  // Found by name, not id: the id is derived from the author and name.
  const id = Object.keys(installations.extensions).find(
    (key) => installations.extensions[key]?.manifest.name === manifest.name,
  );

  if (id == null) {
    openInClaudeDesktop();
  } else {
    const installedDir = join(claudeDir, "Claude Extensions", id);
    const entry = installations.extensions[id];

    rmSync(installedDir, { recursive: true, force: true });
    cpSync(unpackDir, installedDir, { recursive: true });

    if (entry != null) {
      const previousVersion = entry.version;

      Object.assign(entry, { version: manifest.version, manifest });
      writeFileSync(installationsFile, JSON.stringify(installations, null, 2));
      console.log(`Replaced ${installedDir}`);
      console.log(`Version: ${previousVersion} -> ${manifest.version}`);
    }

    console.log(
      "Restart Claude Desktop, or turn the extension off and on, to load it.",
    );
  }
} finally {
  rmSync(unpackDir, { recursive: true, force: true });
}

/** Hand the .mcpb to Claude Desktop, which asks to confirm the install. */
function openInClaudeDesktop(): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", ["-a", "Claude", mcpbFile]]
      : ["cmd", ["/c", "start", "", mcpbFile]];

  if (spawnSync(cmd, args, { stdio: "inherit" }).status !== 0) {
    exit("Couldn't open it in Claude Desktop. Is it installed?");
  }

  console.log(
    `Opened ${mcpbFile} in Claude Desktop. Confirm the install there.`,
  );
}

/**
 * Print an error and stop.
 *
 * @param message - What went wrong
 * @returns Never
 */
function exit(message: string): never {
  console.error(message);
  process.exit(1);
}
