// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The run record: a run's command line and CLI options, saved beside its
 * results so `--resume` can replay them. It is not a result, so anything that
 * reads a run folder's results skips it.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RUN_RECORD_FILE } from "../../json-results/result-file.ts";

export interface RunRecord<Options> {
  /** The command-line arguments the run was started with. */
  argv: string[];
  /** The parsed options to replay. */
  options: Options;
}

/**
 * Save a run's record in its results folder.
 *
 * @param dir - The run's results folder
 * @param record - What to save
 */
export async function writeRunRecord<Options>(
  dir: string,
  record: RunRecord<Options>,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, RUN_RECORD_FILE),
    JSON.stringify(record, null, 2) + "\n",
  );
}

/**
 * Read a run's record.
 *
 * @param dir - The run's results folder
 * @returns The saved record
 */
export async function readRunRecord<Options>(
  dir: string,
): Promise<RunRecord<Options>> {
  let text: string;

  try {
    text = await readFile(join(dir, RUN_RECORD_FILE), "utf8");
  } catch {
    throw new Error(
      `No ${RUN_RECORD_FILE} in ${dir}: the run doesn't exist, predates --resume, or used --no-save`,
    );
  }

  return JSON.parse(text) as RunRecord<Options>;
}
