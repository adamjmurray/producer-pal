// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Kept apart from the backup store, which loads max-api: the eval runner
// deletes eval Sets' sidecars from plain Node.

import { dirname, join } from "node:path";

/** Filename of the project-context backup, dropped beside the Live Set. */
const SIDECAR_FILENAME = "Producer Pal Project Context.md";

/**
 * Absolute path of the backup sidecar for a given Live Set file. Derived from
 * the .als's DIRECTORY and never its basename, so every Set in a Live Project
 * shares one sidecar and a Set can be renamed without orphaning it. See the
 * backup store's file header before changing this — the folder keying is a
 * requirement.
 *
 * @param liveSetPath - Absolute path to the Live Set (.als) file
 * @returns Absolute path to the sidecar markdown file
 */
export function projectContextSidecarPath(liveSetPath: string): string {
  return join(dirname(liveSetPath), SIDECAR_FILENAME);
}
