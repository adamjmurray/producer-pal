// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Writes JSON eval results to disk
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type JsonEvalResult, RESULTS_DIR } from "./types.ts";

/**
 * Write a JSON eval result to disk.
 * Creates the directory structure if needed.
 *
 * @param result - The JSON eval result to persist
 * @returns Path to the written file
 */
export async function writeJsonResult(result: JsonEvalResult): Promise<string> {
  const dir = join(RESULTS_DIR, result.scenarioId);

  await mkdir(dir, { recursive: true });

  const filePath = join(dir, `${result.runId}.json`);

  await writeFile(filePath, JSON.stringify(result, null, 2) + "\n");

  return filePath;
}
