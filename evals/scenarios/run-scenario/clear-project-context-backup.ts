// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Setting project context makes the device back it up to a file beside the
 * open Set's .als, and a fresh open restores from that file. Eval Sets are
 * opened from the repo, so without this one scenario's project context comes
 * back in a later scenario on the same Set. resetConfig() can't help: it empties
 * the param, which leaves the file alone.
 */

import { rmSync } from "node:fs";
import { projectContextSidecarPath } from "#src/mcp-server/helpers/project-context-backup/project-context-sidecar-path.ts";

/**
 * Delete the project-context backup beside an eval Live Set. Throws when the
 * file can't be deleted, so the scenario errors instead of running on another
 * scenario's context.
 *
 * @param liveSetPath - Path to the scenario's .als file
 */
export function clearProjectContextBackup(liveSetPath: string): void {
  rmSync(projectContextSidecarPath(liveSetPath), { force: true });
}
