// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reveals the machine-global config directory (~/.producer-pal) in the OS file
// browser. Triggered by a Max device button that sends an "openConfigFolder"
// message to the Node-for-Max process. Shipped src/ is barred from shelling out
// (eslint no-restricted-imports on child_process), so Node only resolves the
// home dir (which Max can't do cross-platform) and hands the patch a file:// URL
// to open with `max launchbrowser`.

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
 */
export function revealConfigDir(): void {
  if (isConfigDirInert()) return;

  const dir = configDir();

  try {
    mkdirSync(dir, { recursive: true });
  } catch (error) {
    console.error(`Failed to create ${dir}: ${errorMessage(error)}`);

    return;
  }

  // pathToFileURL handles cross-platform paths and URL-encodes spaces — the
  // whole reason to build the URL here rather than in the patch.
  void Max.outlet("openConfigFolder", pathToFileURL(dir).href);
}
