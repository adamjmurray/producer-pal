#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Copy the Producer_Pal remote script into Live's User Library.
 *
 * Usage: npm run remote-script:install [-- --probe [--reload]]
 *
 * --probe also adds the dev-only /probe route, which runs posted Python in
 * Live (see scripts/live-api/python-probe/), and the dev-only /reload route.
 * Reinstall without it to remove them.
 *
 * --reload (needs --probe) then asks the running Live to reload the new code,
 * so a restart isn't needed, and checks that Live loaded what was installed.
 * Live must already have a /reload route, so the first install with --probe
 * still needs a restart, as does a change to a bootstrap file
 * (see remote-script/README.md).
 *
 * Reads ABLETON_USER_LIBRARY from .env (see .env.example). The device installs
 * the same files from its own bundle; this is the dev shortcut. Live only scans
 * Remote Scripts at startup, so without --reload, restart Live afterwards.
 */

import { installRemoteScript } from "#src/mcp-server/rpc/remote-script/remote-script-install.ts";
import { UserLibraryFolderError } from "#src/mcp-server/rpc/remote-script/user-library/user-library-folder.ts";
import { addReloadRoute } from "./hot-reload/add-reload-route.ts";
import {
  describeReload,
  reloadRemoteScript,
} from "./hot-reload/reload-remote-script.ts";
import { addProbeRoute } from "./python-probe/add-probe-route.ts";

// installRemoteScript expands a leading "~" and checks the folder.
const userLibrary = process.env.ABLETON_USER_LIBRARY;
const withProbe = process.argv.includes("--probe");
const withReload = process.argv.includes("--reload");

if (!userLibrary) {
  console.error(
    "Set ABLETON_USER_LIBRARY in .env to your Ableton User Library folder (see .env.example).",
  );
  process.exit(1);
}

if (withReload && !withProbe) {
  console.error(
    "--reload needs --probe, which adds the /reload route. Without it the new code would have no /reload to call next time.",
  );
  process.exit(1);
}

let installedPath: string;

try {
  const { path } = installRemoteScript(userLibrary);

  installedPath = path;
  console.log(`Installed to ${path}`);

  if (withProbe) {
    addProbeRoute(path);
    addReloadRoute(path);
    console.log("Added the dev-only /probe and /reload routes.");
  }
} catch (error) {
  console.error(
    error instanceof UserLibraryFolderError
      ? `ABLETON_USER_LIBRARY: ${error.message}`
      : String(error),
  );
  process.exit(1);
}

if (withReload) {
  const { ok, message } = describeReload(
    await reloadRemoteScript(installedPath),
  );

  if (ok) {
    console.log(message);
  } else {
    console.error(message);
    process.exitCode = 1;
  }
} else {
  console.log(
    "If you haven't already, enable the Producer Pal control script in Live's MIDI settings.",
  );
  console.log("Restart Live to load the latest code.");
}
