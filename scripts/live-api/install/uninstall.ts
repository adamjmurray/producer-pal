#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Remove Producer Pal's files from the Ableton User Library. No prompts.
 *
 * Usage (see package.json for the npm run names):
 *   --device           the installed device; other copies are listed, kept
 *   --other-copies     with --device, delete the other copies too
 *   --remote-script    the remote script and its temp/backup folders
 */

import { errorMessage } from "#src/shared/error-message.ts";
import { resolveInstallLibraryOrExit } from "./helpers/install-library.ts";
import { parseUninstallFlags } from "./helpers/uninstall-flags.ts";
import {
  describeUninstall,
  uninstallFromLibrary,
} from "./helpers/uninstall-from-library.ts";

try {
  const options = parseUninstallFlags(process.argv.slice(2));
  const library = await resolveInstallLibraryOrExit();
  const result = uninstallFromLibrary(library.path, options);
  const { out, err } = describeUninstall(result, options);

  for (const line of out) {
    console.log(line);
  }

  for (const line of err) {
    console.error(line);
  }

  process.exitCode = result.failed.length > 0 ? 1 : 0;
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}
