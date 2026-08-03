// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The machine-global settings file, ~/.producer-pal/settings.json. Small
// non-content preferences shared by the device and every client — as opposed to
// the markdown slots beside it (context.md, system-prompt.md), which hold user
// content and get their own byte-faithful store. Filesystem access is Node-side
// only, so the chat UI round-trips through /settings.
//
// Unknown keys are preserved across writes so an older build can't silently drop
// a setting a newer one added.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "../../node-for-max-logger.ts";
import {
  isConfigDirInert,
  resolveConfigPath,
} from "./config-markdown-store.ts";

const FILENAME = "settings.json";

export interface GlobalSettings {
  /**
   * Whether Producer Pal may check GitHub for a newer release. Opt-OUT: the
   * default is true, so behavior is unchanged for anyone who never touches it.
   */
  autoUpdateCheck: boolean;
  /**
   * The version whose update notification the user dismissed, or null. Keyed by
   * version rather than a build identity because every build of a cycle now
   * carries a distinct `-rcN` version (see version-check.ts) — so a dismissal
   * suppresses exactly that release and lifts on the next one.
   */
  dismissedUpdateVersion: string | null;
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  autoUpdateCheck: true,
  dismissedUpdateVersion: null,
};

/**
 * Read the machine-global settings, falling back to defaults for anything
 * missing, mistyped, or unreadable. Never throws: these are preferences, and a
 * corrupt file must not wedge the features that read them.
 *
 * @returns The current settings, with defaults filled in
 */
export function readGlobalSettings(): GlobalSettings {
  const raw = readRaw();

  return {
    autoUpdateCheck:
      typeof raw.autoUpdateCheck === "boolean"
        ? raw.autoUpdateCheck
        : DEFAULT_GLOBAL_SETTINGS.autoUpdateCheck,
    dismissedUpdateVersion:
      typeof raw.dismissedUpdateVersion === "string"
        ? raw.dismissedUpdateVersion
        : DEFAULT_GLOBAL_SETTINGS.dismissedUpdateVersion,
  };
}

/**
 * Merge a partial update into the settings file and return the result. Writes
 * to a temp file and renames it into place so a crash mid-write can't leave a
 * half-written file.
 *
 * @param patch - Fields to change; omitted fields keep their stored value
 * @returns The settings after the merge
 */
export function updateGlobalSettings(
  patch: Partial<GlobalSettings>,
): GlobalSettings {
  if (isConfigDirInert()) return readGlobalSettings();

  const merged = { ...readRaw(), ...patch };
  const target = resolveConfigPath(FILENAME);
  const tmpPath = `${target}.tmp`;

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(tmpPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  renameSync(tmpPath, target);

  return readGlobalSettings();
}

/**
 * Read the settings file as a plain object, unknown keys and all. A missing
 * file is the normal empty-by-default case; anything else (unparseable JSON, a
 * non-object payload, an I/O error) warns and yields {} so callers fall back to
 * defaults instead of failing.
 *
 * @returns The parsed file contents, or {} when absent or unusable
 */
function readRaw(): Record<string, unknown> {
  if (isConfigDirInert()) return {};

  const target = resolveConfigPath(FILENAME);
  let text: string;

  try {
    text = readFileSync(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Failed to read ${target}: ${errorMessage(error)}`);
    }

    return {};
  }

  try {
    const parsed: unknown = JSON.parse(text);

    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not a JSON object");
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    console.warn(`Ignoring malformed ${target}: ${errorMessage(error)}`);

    return {};
  }
}
