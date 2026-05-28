#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Verification harness for AJM-330 — exercise the production read-only
 * open path against the real Live DB and report file state, query timings,
 * staleness signals, and any errors.
 *
 * Usage:
 *   npx tsx scripts/verify-live-db-readonly.ts [--duration=<seconds>]
 *
 * Run once with Live closed for a baseline, then again with Live open
 * (use `scripts/open-live-set` to launch a known-safe test project).
 */

import { stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { type DatabaseSync } from "node:sqlite";
import {
  findLiveFilesDbPath,
  findLivePluginsDbPath,
} from "#src/mcp-server/live-library/live-db-path.ts";
import { openLiveDb } from "#src/mcp-server/live-library/live-db.ts";

interface FileState {
  path: string;
  exists: boolean;
  size: number;
  mtimeMs: number;
}

interface QueryResult {
  label: string;
  runs: number;
  errors: number;
  uniqueValues: Set<string>;
  timingsMs: number[];
}

const DEFAULT_DURATION_SECONDS = 30;
const QUERY_INTERVAL_MS = 250;

await main();

/**
 * CLI entry point.
 */
async function main(): Promise<void> {
  const durationSeconds = parseDuration(process.argv);

  const filesDbPath = await findLiveFilesDbPath();
  const pluginsDbPath = await findLivePluginsDbPath();

  if (!filesDbPath) {
    console.error("No Live-files-*.db found. Aborting.");
    process.exit(1);
  }

  console.log(`=== AJM-330 verification harness ===`);
  console.log(`Files DB:   ${filesDbPath}`);
  console.log(`Plugins DB: ${pluginsDbPath ?? "(none)"}`);
  console.log(`Duration:   ${durationSeconds}s`);
  console.log("");

  console.log("--- File state BEFORE query loop ---");
  await reportSidecarState(filesDbPath);
  console.log("");

  const queryResults = await runQueryLoop(filesDbPath, durationSeconds);

  console.log("");
  console.log("--- File state AFTER query loop ---");
  await reportSidecarState(filesDbPath);
  console.log("");

  console.log("--- Query results ---");
  reportQueryResults(queryResults);
}

/**
 * Parse --duration=<seconds> from argv.
 *
 * @param argv - process.argv
 * @returns Duration in seconds (default DEFAULT_DURATION_SECONDS)
 */
function parseDuration(argv: string[]): number {
  const arg = argv.find((a) => a.startsWith("--duration="));

  if (!arg) {
    return DEFAULT_DURATION_SECONDS;
  }

  const parsed = Number.parseInt(arg.slice("--duration=".length), 10);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_DURATION_SECONDS;
}

/**
 * Stat the DB and its WAL/SHM sidecars and print a one-line summary each.
 *
 * @param dbPath - Absolute path to the .db file
 */
async function reportSidecarState(dbPath: string): Promise<void> {
  for (const suffix of ["", "-wal", "-shm"]) {
    const fullPath = dbPath + suffix;
    const state = await statFile(fullPath);

    if (state.exists) {
      const sizeMb = (state.size / (1024 * 1024)).toFixed(2);
      const ageS = ((Date.now() - state.mtimeMs) / 1000).toFixed(1);
      const tag = suffix === "" ? "DB " : suffix.slice(1).toUpperCase();

      console.log(
        `  ${tag.padEnd(3)} size=${sizeMb.padStart(8)} MB  mtime=${formatMtime(
          state.mtimeMs,
        )}  age=${ageS}s`,
      );
    } else {
      const tag = suffix === "" ? "DB " : suffix.slice(1).toUpperCase();

      console.log(`  ${tag.padEnd(3)} (missing)`);
    }
  }
}

/**
 * Stat a file, returning a FileState record (exists=false on ENOENT).
 *
 * @param path - Absolute path
 * @returns FileState with exists/size/mtimeMs filled
 */
async function statFile(path: string): Promise<FileState> {
  try {
    const stats = await stat(path);

    return {
      path,
      exists: true,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    };
  } catch {
    return { path, exists: false, size: 0, mtimeMs: 0 };
  }
}

/**
 * Format an mtime as a local-time HH:MM:SS string for compact display.
 *
 * @param mtimeMs - Milliseconds since epoch
 * @returns "HH:MM:SS"
 */
function formatMtime(mtimeMs: number): string {
  return new Date(mtimeMs).toLocaleTimeString("en-US", { hour12: false });
}

/**
 * Run the query barrage for the requested duration, polling each query
 * every QUERY_INTERVAL_MS.
 *
 * @param dbPath - Absolute path to the files DB
 * @param durationSeconds - How long to run the loop
 * @returns Per-query stats
 */
async function runQueryLoop(
  dbPath: string,
  durationSeconds: number,
): Promise<QueryResult[]> {
  const db = openLiveDb(dbPath);
  const queries = buildQueries();
  const results: QueryResult[] = queries.map((q) => ({
    label: q.label,
    runs: 0,
    errors: 0,
    uniqueValues: new Set<string>(),
    timingsMs: [],
  }));

  const deadline = performance.now() + durationSeconds * 1000;
  const lastReportAt = { value: performance.now() };

  console.log(`--- Query loop running for ${durationSeconds}s ---`);

  while (performance.now() < deadline) {
    for (let i = 0; i < queries.length; i++) {
      runOneQuery(db, queries[i] as Query, results[i] as QueryResult);
    }

    maybeReportProgress(results, lastReportAt);

    await sleep(QUERY_INTERVAL_MS);
  }

  db.close();

  return results;
}

interface Query {
  label: string;
  sql: string;
  pickValue: (rows: unknown[]) => string;
}

/**
 * Build the set of representative queries to repeat.
 *
 * @returns Query specs with label, SQL, and value-extraction fn
 */
function buildQueries(): Query[] {
  return [
    {
      label: "files COUNT(*)",
      sql: "SELECT COUNT(*) AS n FROM files",
      pickValue: (rows) => String((rows[0] as { n: number }).n),
    },
    {
      label: "files MAX(mod_date)",
      sql: "SELECT MAX(mod_date) AS m FROM files",
      pickValue: (rows) => String((rows[0] as { m: number }).m),
    },
    {
      label: "top use_count",
      sql: "SELECT name, use_count FROM files WHERE use_count > 0 ORDER BY use_count DESC LIMIT 5",
      pickValue: (rows) => JSON.stringify(rows),
    },
    {
      label: "places JOIN files",
      sql: "SELECT p.name AS place, COUNT(f.file_id) AS n FROM places p LEFT JOIN files f ON f.place_id = p.file_id GROUP BY p.file_id ORDER BY n DESC LIMIT 5",
      pickValue: (rows) => JSON.stringify(rows),
    },
    {
      label: "keywords COUNT(*)",
      sql: "SELECT COUNT(*) AS n FROM keywords",
      pickValue: (rows) => String((rows[0] as { n: number }).n),
    },
  ];
}

/**
 * Run a single query, time it, capture its result hash, count errors.
 *
 * @param db - Open read-only DB
 * @param query - Query spec
 * @param result - Accumulator to update
 */
function runOneQuery(
  db: DatabaseSync,
  query: Query,
  result: QueryResult,
): void {
  const start = performance.now();

  try {
    const rows = db.prepare(query.sql).all();
    const elapsed = performance.now() - start;

    result.runs += 1;
    result.timingsMs.push(elapsed);
    result.uniqueValues.add(query.pickValue(rows));
  } catch (error) {
    result.errors += 1;

    console.error(
      `  ERROR on "${query.label}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Print a one-line progress update every ~5 seconds during the loop.
 *
 * @param results - Current per-query stats
 * @param last - Mutable wrapper holding last-report timestamp
 * @param last.value - Last-report timestamp (mutated in place)
 */
function maybeReportProgress(
  results: QueryResult[],
  last: { value: number },
): void {
  const now = performance.now();

  if (now - last.value < 5000) {
    return;
  }

  last.value = now;

  const totalRuns = results.reduce((sum, r) => sum + r.runs, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

  console.log(
    `  [${formatMtime(Date.now())}] ${totalRuns} runs, ${totalErrors} errors`,
  );
}

/**
 * Print final per-query stats: run count, errors, unique result count,
 * timing distribution.
 *
 * @param results - Per-query accumulators
 */
function reportQueryResults(results: QueryResult[]): void {
  for (const r of results) {
    const sorted = [...r.timingsMs].sort((a, b) => a - b);
    const min = sorted[0]?.toFixed(1) ?? "—";
    const p50 = sorted[Math.floor(sorted.length / 2)]?.toFixed(1) ?? "—";
    const max = sorted.at(-1)?.toFixed(1) ?? "—";

    console.log(
      `  ${r.label.padEnd(24)}  runs=${String(r.runs).padStart(4)}  ` +
        `errors=${r.errors}  unique=${r.uniqueValues.size}  ` +
        `min=${min}ms p50=${p50}ms max=${max}ms`,
    );

    if (r.uniqueValues.size > 1) {
      const values = [...r.uniqueValues];
      const compact = values.map((v) =>
        v.length > 60 ? v.slice(0, 60) + "…" : v,
      );

      console.log(`    distinct values seen:`);

      for (const v of compact) {
        console.log(`      • ${v}`);
      }
    }
  }
}

/**
 * Sleep helper.
 *
 * @param ms - Milliseconds
 * @returns Promise that resolves after ms
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
