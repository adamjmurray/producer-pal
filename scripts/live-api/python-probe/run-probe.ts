#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Run a Python file in Live through the dev-only /probe route and print the
 * result as JSON.
 *
 * Usage: node scripts/live-api/python-probe/run-probe.ts <file.py> [out.json]
 *
 * Needs `npm run remote-script:install -- --probe` and a Live restart. The
 * file sees `song`, `app`, `Live` and `bridge`, and returns what it assigns to
 * `result`. See snippets/ for examples.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { runProbe } from "./probe-client.ts";

const [file, outFile] = process.argv.slice(2);

if (file == null) {
  console.error(
    "Usage: node scripts/live-api/python-probe/run-probe.ts <file.py> [out.json]",
  );
  process.exit(1);
}

try {
  const json = JSON.stringify(
    await runProbe(readFileSync(file, "utf8")),
    null,
    2,
  );

  if (outFile == null) {
    console.log(json);
  } else {
    writeFileSync(outFile, `${json}\n`);
    console.log(`Wrote ${outFile}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
