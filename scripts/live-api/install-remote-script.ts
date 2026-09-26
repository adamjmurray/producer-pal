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
 * Reads ABLETON_USER_LIBRARY from .env (see .env.example). The device installs
 * the same files from its own bundle; this is the dev shortcut. Live only scans
 * Remote Scripts at startup, so restart Live afterwards.
 */

import {
  RemoteScriptInstallError,
  installRemoteScript,
} from "#src/mcp-server/rpc/remote-script/remote-script-install.ts";

// installRemoteScript expands a leading "~" and checks the folder.
const userLibrary = process.env.ABLETON_USER_LIBRARY;

if (!userLibrary) {
  console.error(
    "Set ABLETON_USER_LIBRARY in .env to your Ableton User Library folder (see .env.example).",
  );
  process.exit(1);
}

try {
  const { path } = installRemoteScript(userLibrary);

  console.log(`Installed to ${path}`);
} catch (error) {
  console.error(
    error instanceof RemoteScriptInstallError
      ? `ABLETON_USER_LIBRARY: ${error.message}`
      : String(error),
  );
  process.exit(1);
}

console.log(
  "If you haven't already, enable the Producer Pal control script in Live's MIDI settings.",
);
console.log("Restart Live to load the latest code.");
