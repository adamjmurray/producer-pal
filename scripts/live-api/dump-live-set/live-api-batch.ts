// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Packs many objects into one ppal-live-api call. `set_path` is an operation
// like any other, so a single request can retarget the tool's LiveAPI object
// over and over and read each target in turn — one HTTP round trip per fifty
// operations instead of one per object.
//
// A request is all-or-nothing: the tool aborts the whole array on the first
// operation that throws. So a failed request is halved and retried until the
// offending read is alone, and only that read is recorded as null. Without
// that, one unreadable property would cost every other property on the object.

import {
  MAX_OPERATIONS,
  type OperationType,
} from "#src/tools/advanced/live-api-operations.ts";

export interface LiveApiOp {
  type: OperationType;
  property?: string;
  method?: string;
  value?: unknown;
  args?: unknown[];
}

/** One object's reads. The `set_path` that targets them is added here. */
export interface Job {
  path: string;
  ops: LiveApiOp[];
}

export interface BatchStats {
  requests: number;
  retries: number;
  failedOps: number;
}

export interface BatchContext {
  baseUrl: string;
  stats: BatchStats;
}

/** Reads left in a request once `set_path` has taken its slot. */
const MAX_READS_PER_CHUNK = MAX_OPERATIONS - 1;

interface Chunk {
  jobIndex: number;
  path: string;
  ops: LiveApiOp[];
}

/**
 * Run a batch of per-object reads against a running Producer Pal device.
 *
 * Requests go out one at a time on purpose: Live is single-threaded, and the
 * build-stats counter resets per request, so overlapping calls would interleave.
 *
 * @param ctx - Base URL and the running counters
 * @param jobs - One entry per object to read
 * @returns Per job, one result per op in order; null where that read failed
 */
export async function liveApiBatch(
  ctx: BatchContext,
  jobs: Job[],
): Promise<unknown[][]> {
  const collected: unknown[][] = jobs.map(() => []);

  for (const pack of packChunks(chunkJobs(jobs))) {
    const packResults = await sendPack(ctx, pack);

    // Chunks stay in job order all the way through, so appending rebuilds each
    // job's reads in the order it asked for them.
    for (const [index, chunk] of pack.entries()) {
      collected[chunk.jobIndex]?.push(...(packResults[index] ?? []));
    }
  }

  return collected;
}

/**
 * Run one operation array and return its results, throwing on any failure.
 * Used for the connectivity preflight, where a failure should be loud.
 *
 * @param ctx - Batch context
 * @param ops - Operations to run
 * @returns One result per operation
 */
export async function runOperations(
  ctx: BatchContext,
  ops: LiveApiOp[],
): Promise<unknown[]> {
  ctx.stats.requests++;

  const response = await fetch(`${ctx.baseUrl}/api/tools/ppal-live-api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations: ops }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${String(response.status)} ${response.statusText}`);
  }

  const body = (await response.json()) as {
    result?: unknown;
    isError?: boolean;
  };

  if (body.isError) throw new Error(String(body.result));

  const results = (
    body.result as { results?: { result: unknown }[] } | undefined
  )?.results;

  if (!results) throw new Error("ppal-live-api returned no results");

  return results.map((entry) => entry.result);
}

/**
 * Create a batch context with zeroed counters.
 * @param baseUrl - Producer Pal server base URL
 * @returns A fresh context
 */
export function createBatchContext(baseUrl: string): BatchContext {
  return { baseUrl, stats: { requests: 0, retries: 0, failedOps: 0 } };
}

/**
 * Split jobs whose read count exceeds what one request can hold.
 * @param jobs - The jobs to split
 * @returns Chunks, in job order
 */
function chunkJobs(jobs: Job[]): Chunk[] {
  const chunks: Chunk[] = [];

  for (const [jobIndex, job] of jobs.entries()) {
    for (let at = 0; at < job.ops.length; at += MAX_READS_PER_CHUNK) {
      chunks.push({
        jobIndex,
        path: job.path,
        ops: job.ops.slice(at, at + MAX_READS_PER_CHUNK),
      });
    }
  }

  return chunks;
}

/**
 * Group chunks into requests that stay under the operation cap.
 * @param chunks - Chunks to pack
 * @returns Packs, each one request's worth
 */
function packChunks(chunks: Chunk[]): Chunk[][] {
  const packs: Chunk[][] = [];
  let pack: Chunk[] = [];
  let size = 0;

  for (const chunk of chunks) {
    const cost = chunk.ops.length + 1;

    if (size + cost > MAX_OPERATIONS && pack.length > 0) {
      packs.push(pack);
      pack = [];
      size = 0;
    }

    pack.push(chunk);
    size += cost;
  }

  if (pack.length > 0) packs.push(pack);

  return packs;
}

/**
 * Send one pack, halving it until a failure is isolated to a single read.
 * @param ctx - Batch context
 * @param pack - Chunks to send together
 * @returns Per chunk, one result per op; null where that read failed
 */
async function sendPack(
  ctx: BatchContext,
  pack: Chunk[],
): Promise<unknown[][]> {
  const results = await tryPack(ctx, pack);

  if (results) return results;

  ctx.stats.retries++;

  if (pack.length > 1) return await splitPack(ctx, pack);

  const chunk = pack[0] as Chunk;

  if (chunk.ops.length === 1) {
    ctx.stats.failedOps++;

    return [[null]];
  }

  const half = Math.ceil(chunk.ops.length / 2);
  const head = await sendPack(ctx, [
    { ...chunk, ops: chunk.ops.slice(0, half) },
  ]);
  const tail = await sendPack(ctx, [{ ...chunk, ops: chunk.ops.slice(half) }]);

  return [[...(head[0] ?? []), ...(tail[0] ?? [])]];
}

/**
 * Retry a multi-chunk pack one chunk at a time.
 * @param ctx - Batch context
 * @param pack - The pack that failed
 * @returns Per chunk, one result per op
 */
async function splitPack(
  ctx: BatchContext,
  pack: Chunk[],
): Promise<unknown[][]> {
  const split: unknown[][] = [];

  for (const chunk of pack) {
    split.push(...(await sendPack(ctx, [chunk])));
  }

  return split;
}

/**
 * Attempt one request and slice the flat result list back out per chunk.
 * @param ctx - Batch context
 * @param pack - Chunks to send together
 * @returns Per-chunk results, or null if the request failed
 */
async function tryPack(
  ctx: BatchContext,
  pack: Chunk[],
): Promise<unknown[][] | null> {
  // The generic is load-bearing: without it the literal widens `type` to
  // string, and the lint autofixer strips an inline assertion as redundant.
  const ops = pack.flatMap<LiveApiOp>((chunk) => [
    { type: "set_path", value: chunk.path },
    ...chunk.ops,
  ]);

  let raw: unknown[];

  try {
    raw = await runOperations(ctx, ops);
  } catch {
    return null;
  }

  // A short result list means the tool answered something other than what was
  // asked; slicing it would misattribute values to the wrong properties.
  if (raw.length !== ops.length) return null;

  const results: unknown[][] = [];
  let cursor = 0;

  for (const chunk of pack) {
    cursor++;
    results.push(raw.slice(cursor, cursor + chunk.ops.length));
    cursor += chunk.ops.length;
  }

  return results;
}
