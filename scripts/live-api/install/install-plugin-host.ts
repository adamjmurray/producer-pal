#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Copy the plug-in hosting wrapper devices (max-for-live-device/plugin-host/)
 * into the Ableton User Library, replacing any that differ. Reads the repo
 * files, whatever the build flags.
 *
 * Usage: npm run install:plugin-host
 *
 * A Set that's already open keeps the old wrapper until it's reopened.
 */

import { join } from "node:path";
import { installPluginHostWrappers } from "#src/portal/setup/plugin-host/plugin-host-install.ts";
import {
  pluginHostSourceDir,
  readPluginHostSource,
} from "#src/portal/setup/plugin-host/plugin-host-source.ts";
import { resolveInstallLibraryOrExit } from "./helpers/install-library.ts";
import { runInstallReport } from "./run-install-report.ts";
import { describePluginHostInstall } from "./plugin-host-report.ts";

const rootDir = join(import.meta.dirname, "../../..");

await runInstallReport(async () => {
  const library = await resolveInstallLibraryOrExit();

  return describePluginHostInstall(
    installPluginHostWrappers(
      library.path,
      readPluginHostSource(pluginHostSourceDir(rootDir)),
    ),
  );
});
