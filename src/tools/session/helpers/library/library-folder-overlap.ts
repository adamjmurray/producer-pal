// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  MAX_SINGLE_MESSAGE_BYTES,
  utf8ByteLength,
} from "#src/shared/mcp-responses.ts";

// Room left in a request for the route name and Live version around the paths.
const BATCH_BYTES = MAX_SINGLE_MESSAGE_BYTES - 1000;

/**
 * The DB's file_ids for files the sample-folder scan already matched, so the
 * DB search can leave them out (a file both list shows once, as the folder's).
 *
 * A V8-to-Node message is capped near 30KB and a folder can match a thousand
 * paths, so the paths go over in batches and only their ids go into the search.
 *
 * @param paths - Absolute paths of the folder's matches
 * @param resolve - Asks the `library.resolveFileIds` route for one batch's ids
 * @returns The ids of the paths the DB lists
 */
export async function folderFileIds(
  paths: string[],
  resolve: (batch: string[]) => Promise<number[]>,
): Promise<number[]> {
  const ids: number[] = [];

  for (const batch of batchByBytes(paths)) {
    ids.push(...(await resolve(batch)));
  }

  return ids;
}

/**
 * Split paths into batches that each fit one request.
 *
 * @param paths - Paths to split
 * @returns Batches in order, none empty
 */
function batchByBytes(paths: string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let bytes = 0;

  for (const path of paths) {
    // As JSON writes it: quotes, escapes, and the comma after it.
    const size = utf8ByteLength(JSON.stringify(path)) + 1;

    if (batch.length > 0 && bytes + size > BATCH_BYTES) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }

    batch.push(path);
    bytes += size;
  }

  if (batch.length > 0) {
    batches.push(batch);
  }

  return batches;
}
