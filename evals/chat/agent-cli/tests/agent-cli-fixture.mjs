#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * A stand-in for `codex` / `claude` in the agent-CLI transport tests.
 *
 * `spawnAgentCli` resolves its executable from the transport's `binEnvVar`
 * (`CODEX_BIN`, `CLAUDE_CODE_BIN`, …), so pointing that at this script exercises
 * the whole transport — argv, stdin, stream decoding, exit handling, signals —
 * with no vendor CLI installed and no network.
 *
 * Everything it does is driven by `PPAL_FIXTURE_*` environment variables:
 *
 * - `PPAL_FIXTURE_STDOUT`     text to write to stdout (usually canned JSONL)
 * - `PPAL_FIXTURE_SPLIT_AT`   byte offset to flush stdout in two chunks at,
 *                             so a test can split a multi-byte character
 * - `PPAL_FIXTURE_STDERR`     text to write to stderr
 * - `PPAL_FIXTURE_EXIT_CODE`  exit code (default 0)
 * - `PPAL_FIXTURE_RECORD`     JSONL file to append `{ argv, stdin, cwd }` to,
 *                             one line per invocation
 * - `PPAL_FIXTURE_MODE`       `emit` (default), `hang` (never exit on its own),
 *                             or `ignore-sigterm` (hang AND swallow SIGTERM, so
 *                             only the SIGKILL escalation ends it)
 */

import { appendFileSync } from "node:fs";

const HANG_MS = 60_000;
const CHUNK_GAP_MS = 25;

const mode = process.env.PPAL_FIXTURE_MODE ?? "emit";

if (mode === "ignore-sigterm") {
  process.on("SIGTERM", () => {});
}

await main();

/**
 * Record the invocation, emit the canned streams, then exit as configured.
 * @returns Nothing
 */
async function main() {
  const stdin = await readStdin();
  const record = process.env.PPAL_FIXTURE_RECORD;

  if (record) {
    const line = JSON.stringify({
      argv: process.argv.slice(2),
      stdin,
      cwd: process.cwd(),
    });

    appendFileSync(record, `${line}\n`, "utf8");
  }

  const stderr = process.env.PPAL_FIXTURE_STDERR;

  if (stderr) process.stderr.write(stderr);

  await writeStdout();

  if (mode !== "emit") {
    await delay(HANG_MS);
  }

  process.exit(Number(process.env.PPAL_FIXTURE_EXIT_CODE ?? "0"));
}

/**
 * Write the canned stdout, optionally as two chunks split at a byte offset.
 * @returns Nothing
 */
async function writeStdout() {
  const out = Buffer.from(process.env.PPAL_FIXTURE_STDOUT ?? "", "utf8");
  const splitAt = Number(process.env.PPAL_FIXTURE_SPLIT_AT ?? "0");

  if (out.length === 0) return;

  if (splitAt > 0 && splitAt < out.length) {
    process.stdout.write(out.subarray(0, splitAt));
    await delay(CHUNK_GAP_MS);
    process.stdout.write(out.subarray(splitAt));

    return;
  }

  process.stdout.write(out);
}

/**
 * Read the prompt the transport wrote to stdin.
 * @returns The full stdin text
 */
async function readStdin() {
  let text = "";

  process.stdin.setEncoding("utf8");

  for await (const chunk of process.stdin) text += chunk;

  return text;
}

/**
 * Sleep.
 * @param ms - Milliseconds to wait
 * @returns A promise resolving after the delay
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
