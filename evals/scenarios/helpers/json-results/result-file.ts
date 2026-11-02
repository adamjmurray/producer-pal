// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Telling result files apart from the other files in a run folder.
 */

/** A run's saved command line and options, for `--resume`; not a result. */
export const RUN_RECORD_FILE = "run.json";

/**
 * Whether a file in a run folder is a trial result.
 *
 * @param name - File name
 * @returns True for result files
 */
export function isResultFile(name: string): boolean {
  return name.endsWith(".json") && name !== RUN_RECORD_FILE;
}
