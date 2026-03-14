#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Run multiple npm scripts in parallel with buffered output.
 * Output is printed in order after all scripts complete.
 *
 * Usage: node scripts/run-parallel.ts script1 script2 script3
 *
 * @example
 *   node scripts/run-parallel.ts typecheck:src typecheck:webui typecheck:e2e
 */

import { spawn } from "node:child_process";

interface Result {
  name: string;
  exitCode: number | null;
  output: string;
}

/**
 * Run a single npm script and capture its output.
 * @param name - The npm script name to run
 * @returns The result with exit code and buffered output
 */
function runScript(name: string): Promise<Result> {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", name, "--silent"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: string[] = [];

    child.stdout.on("data", (data: Buffer) => chunks.push(data.toString()));
    child.stderr.on("data", (data: Buffer) => chunks.push(data.toString()));

    child.on("close", (exitCode) => {
      resolve({ name, exitCode, output: chunks.join("") });
    });
  });
}

const scripts = process.argv.slice(2);

if (scripts.length === 0) {
  console.error("Usage: run-parallel.ts <script1> <script2> ...");
  process.exit(1);
}

const results = await Promise.all(scripts.map(runScript));

// Print all output in original script order
for (const result of results) {
  if (result.output.trim()) {
    process.stdout.write(result.output);
  }
}

const failures = results.filter((r) => r.exitCode !== 0);

if (failures.length > 0) {
  const names = failures.map((f) => f.name).join(", ");

  console.error(`\nFailed: ${names}`);
  process.exit(1);
}
