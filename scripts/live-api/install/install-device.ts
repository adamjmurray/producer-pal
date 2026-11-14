#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Copy the frozen release device (release/Producer_Pal.amxd, made by
 * `npm run release:amxd`) into the Ableton User Library.
 *
 * Usage: npm run install:device [-- --force]
 *
 * --force replaces an installed device that is newer, or that can't be ordered
 * against the release one. A Set that's already open keeps the old device.
 */

import { join } from "node:path";
import { installDevice } from "#src/portal/setup/device-install.ts";
import { resolveInstallLibraryOrExit } from "./helpers/install-library.ts";
import {
  describeDeviceInstall,
  requireReleaseDevice,
} from "./helpers/release-device.ts";
import { runInstallReport } from "./run-install-report.ts";

const rootDir = join(import.meta.dirname, "../../..");
const force = process.argv.includes("--force");

await runInstallReport(async () => {
  const releaseFile = requireReleaseDevice(rootDir);
  const library = await resolveInstallLibraryOrExit();

  return describeDeviceInstall(
    installDevice(library.path, releaseFile, {
      force,
      sourceName: "the release build",
    }),
  );
});
