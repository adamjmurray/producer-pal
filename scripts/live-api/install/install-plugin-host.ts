#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Copy the plug-in hosting wrapper devices (max-for-live-device/plugin-host/)
 * into the Ableton User Library, replacing any that differ.
 *
 * Usage: npm run install:plugin-host
 *
 * A Set that's already open keeps the old wrapper until it's reopened.
 */

import { join } from "node:path";
import { errorMessage } from "#src/shared/error-message.ts";
import { resolveInstallLibraryOrExit } from "./helpers/install-library.ts";
import {
  describePluginHostInstall,
  installPluginHostWrappers,
} from "./helpers/plugin-host/plugin-host-install.ts";

const rootDir = join(import.meta.dirname, "../../..");

try {
  const library = await resolveInstallLibraryOrExit();
  const { lines, ok } = describePluginHostInstall(
    installPluginHostWrappers(library.path, rootDir),
  );

  for (const line of lines) {
    console.log(line);
  }

  process.exitCode = ok ? 0 : 1;
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}
