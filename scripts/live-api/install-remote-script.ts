#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Copy the Producer_Pal remote script into Live's User Library.
 *
 * Usage: npm run remote-script:install
 *
 * Reads ABLETON_USER_LIBRARY from .env (see .env.example). Live only scans
 * Remote Scripts at startup, so restart Live afterwards.
 */

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Live imports the script by folder name, so it must be a valid Python name.
const SCRIPT_NAME = "Producer_Pal";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sourceDir = join(rootDir, "remote-script", SCRIPT_NAME);
const userLibrary = process.env.ABLETON_USER_LIBRARY?.replace(/^~/, homedir());

if (!userLibrary) {
  console.error(
    "Set ABLETON_USER_LIBRARY in .env to your Ableton User Library folder (see .env.example).",
  );
  process.exit(1);
}

if (!existsSync(userLibrary)) {
  console.error(`ABLETON_USER_LIBRARY does not exist: ${userLibrary}`);
  process.exit(1);
}

const destDir = join(userLibrary, "Remote Scripts", SCRIPT_NAME);

// Replace the whole folder so removed modules and stale bytecode don't linger.
rmSync(destDir, { recursive: true, force: true });
mkdirSync(destDir, { recursive: true });
cpSync(sourceDir, destDir, {
  recursive: true,
  filter: (source) => basename(source) !== "__pycache__",
});

console.log(`Installed to ${destDir}`);
console.log(
  "If you haven't already, enable the Producer Pal control script in Live's MIDI settings.",
);
console.log("Restart Live to load the latest code.");
