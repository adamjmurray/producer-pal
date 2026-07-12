// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reveals the machine-global config directory (~/.producer-pal) in the OS file
// browser. Triggered by the chat UI's "Open folder" button via the
// POST /reveal-config-folder route. Shipped src/ is barred from shelling out
// (eslint no-restricted-imports on child_process), so Node only resolves the
// home dir (which Max can't do cross-platform) and emits a file:// URL that the
// Max patch opens with `max launchbrowser` (its existing openConfigFolder
// receiver).

import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import Max from "max-api";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "../node-for-max-logger.ts";
import {
  configDir,
  isConfigDirInert,
} from "./global-context/global-context-store.ts";

/**
 * Reveal ~/.producer-pal in the OS file browser. Ensures the directory exists
 * (so the button always opens a real folder, even before any global context is
 * authored), then emits it as a properly-encoded file:// URL for the patch to
 * open via `max launchbrowser`. No-op under Vitest without a dir override, so
 * importing modules can't create folders or emit during tests.
 *
 * @returns true when the folder was revealed (or skipped as inert); false when
 *   the directory couldn't be created, so the route can report the failure
 */
export function revealConfigDir(): boolean {
  if (isConfigDirInert()) return true;

  const dir = configDir();

  try {
    mkdirSync(dir, { recursive: true });
  } catch (error) {
    console.error(`Failed to create ${dir}: ${errorMessage(error)}`);

    return false;
  }

  // pathToFileURL handles cross-platform paths and URL-encodes spaces — the
  // whole reason to build the URL here rather than in the patch.
  void Max.outlet("openConfigFolder", pathToFileURL(dir).href);

  return true;
}
