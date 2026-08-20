#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Dumps a running Live Set's structure to JSON, for use as a test fixture.
 *
 * Usage: node scripts/live-api/dump-live-set/dump-live-set.ts [output-file] [options]
 *
 * Needs Ableton Live running with the Producer Pal device loaded. Reads only —
 * it never writes to the Set. Absolute filesystem paths are replaced unless
 * --keep-paths is passed, so a dump can be checked in without naming the
 * machine it came from or the samples on it.
 */

import { writeFileSync } from "node:fs";
import { createBatchContext, runOperations } from "./live-api-batch.ts";
import { type LiveSetDump } from "./dump-types.ts";
import { walkLiveSet } from "./walk-live-set.ts";

const DEFAULT_URL = "http://localhost:3350";
const DEFAULT_OUTPUT = "dev/live-set-dump.json";
const DEFAULT_MAX_OBJECTS = 20_000;

interface Args {
  outputPath: string;
  baseUrl: string;
  roots: string[];
  skipChildren: Set<string>;
  maxObjects: number;
  redactPaths: boolean;
  compact: boolean;
}

const HELP = `Usage: node scripts/live-api/dump-live-set/dump-live-set.ts [output-file] [options]

Walks a running Live Set and records every property the LOM exposes, keyed by
the path a tool would build. Read-only.

Options:
  output-file        Output path (default: ${DEFAULT_OUTPUT})
  --url=URL          Server base URL (default: ${DEFAULT_URL})
  --root=PATH        Where to start; repeatable (default: live_set)
  --skip=NAMES       Child names never traversed, comma-separated; repeatable.
                     canonical_parent is always skipped — it points back up.
                     --skip=parameters is the one worth considering: device
                     parameters are most of the objects in a Set full of
                     instruments, and leaving them out makes read-device
                     budgets meaningless.
  --max-objects=N    Stop after N objects (default: ${String(DEFAULT_MAX_OBJECTS)})
  --keep-paths       Record absolute filesystem paths instead of redacting them
  --compact          Write minified JSON instead of indented
  --help, -h         Show this message`;

/**
 * Parse command line arguments
 * @returns Parsed arguments
 */
function parseArgs(): Args {
  const args: Args = {
    outputPath: DEFAULT_OUTPUT,
    baseUrl: DEFAULT_URL,
    roots: [],
    skipChildren: new Set(),
    maxObjects: DEFAULT_MAX_OBJECTS,
    redactPaths: true,
    compact: false,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === "--help" || arg === "-h") {
      console.log(HELP);
      process.exit(0);
    } else if (arg.startsWith("--url=")) {
      args.baseUrl = arg.slice("--url=".length);
    } else if (arg.startsWith("--root=")) {
      args.roots.push(arg.slice("--root=".length));
    } else if (arg.startsWith("--skip=")) {
      for (const name of arg.slice("--skip=".length).split(",")) {
        if (name !== "") args.skipChildren.add(name);
      }
    } else if (arg.startsWith("--max-objects=")) {
      args.maxObjects = Number(arg.slice("--max-objects=".length));
    } else if (arg === "--keep-paths") {
      args.redactPaths = false;
    } else if (arg === "--compact") {
      args.compact = true;
    } else if (arg.startsWith("--")) {
      console.error(`Unknown option: ${arg}\n\n${HELP}`);
      process.exit(1);
    } else {
      args.outputPath = arg;
    }
  }

  if (args.roots.length === 0) args.roots.push("live_set");

  if (!Number.isInteger(args.maxObjects) || args.maxObjects < 1) {
    console.error("--max-objects must be a positive integer");
    process.exit(1);
  }

  return args;
}

/**
 * Check the device answers, and fail with something readable when it doesn't.
 * @param baseUrl - Server base URL
 */
async function checkConnection(baseUrl: string): Promise<void> {
  const ctx = createBatchContext(baseUrl);

  try {
    await runOperations(ctx, [
      { type: "set_path", value: "live_set" },
      { type: "exists" },
    ]);
  } catch (error) {
    console.error(
      `Could not reach ppal-live-api at ${baseUrl}: ${String(error)}\n\n` +
        "Start Ableton Live with the Producer Pal device loaded. The tool is\n" +
        "enabled by a build:debug build, or by the Live API toggle on the\n" +
        "device's Setup tab.",
    );
    process.exit(1);
  }
}

/**
 * Read the running Live version, for the dump's meta.
 * @param baseUrl - Server base URL
 * @returns The version string, or null when Live would not say
 */
async function readLiveVersion(baseUrl: string): Promise<string | null> {
  try {
    const results = await runOperations(createBatchContext(baseUrl), [
      { type: "set_path", value: "live_app" },
      { type: "call", method: "get_version_string" },
    ]);

    return typeof results[1] === "string" ? results[1] : null;
  } catch {
    return null;
  }
}

/**
 * Print what the dump holds, worst offenders first.
 * @param dump - The finished dump
 * @param bytes - Size of the file that was written
 */
function printSummary(dump: LiveSetDump, bytes: number): void {
  const { meta } = dump;
  const perType = new Map<string, number>();

  for (const object of Object.values(dump.objects)) {
    perType.set(object.type, (perType.get(object.type) ?? 0) + 1);
  }

  console.log(
    `\n${String(meta.objects)} objects, ${String(meta.aliases)} aliases, ` +
      `${String(meta.types)} types, ${String(meta.requests)} requests, ` +
      `${(bytes / 1024 / 1024).toFixed(2)} MB`,
  );

  if (meta.failedReads > 0) {
    console.log(`${String(meta.failedReads)} reads failed and recorded null`);
  }

  if (meta.redactedValues > 0) {
    console.log(`${String(meta.redactedValues)} absolute paths redacted`);
  }

  if (meta.truncated) {
    console.log("TRUNCATED at --max-objects; the dump is incomplete");
  }

  console.log("\nObjects by type:");

  for (const [type, count] of [...perType].toSorted((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(6)}  ${type}`);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();

  await checkConnection(args.baseUrl);

  console.log(`Dumping ${args.roots.join(", ")} from ${args.baseUrl}...`);

  const ctx = createBatchContext(args.baseUrl);
  const dump = await walkLiveSet(ctx, {
    roots: args.roots,
    liveVersion: await readLiveVersion(args.baseUrl),
    skipChildren: args.skipChildren,
    maxObjects: args.maxObjects,
    redactPaths: args.redactPaths,
    log: (message) => {
      console.log(message);
    },
  });

  const json = args.compact
    ? JSON.stringify(dump)
    : JSON.stringify(dump, null, 2);

  writeFileSync(args.outputPath, `${json}\n`);
  printSummary(dump, json.length);
  console.log(`\nOutput: ${args.outputPath}`);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
