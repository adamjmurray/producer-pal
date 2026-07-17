#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Outputs coverage and duplication thresholds from config files.
 * Used by GitHub Actions to populate summary tables.
 *
 * Usage:
 *   node scripts/build-and-release/get-thresholds.ts coverage              # outputs all as JSON
 *   node scripts/build-and-release/get-thresholds.ts coverage statements   # outputs single value
 *   node scripts/build-and-release/get-thresholds.ts duplication           # outputs all as JSON
 *   node scripts/build-and-release/get-thresholds.ts duplication source    # outputs single value
 */

import {
  type CoverageThresholds,
  type DuplicationThresholds,
  getCoverageThresholds,
  getDuplicationThresholds,
} from "./helpers/thresholds.ts";

const command = process.argv[2];
const field = process.argv[3];

/**
 * Print one threshold field, or all of them as JSON.
 * @param thresholds - Threshold values for the requested command
 * @param name - Optional single field to print
 */
function printThresholds(
  thresholds: CoverageThresholds | DuplicationThresholds,
  name: string | undefined,
): void {
  if (!name) {
    console.log(JSON.stringify(thresholds));

    return;
  }

  if (!(name in thresholds)) {
    console.error(`Unknown ${command} field: ${name}`);
    process.exit(1);
  }

  console.log(thresholds[name as keyof typeof thresholds]);
}

if (command === "coverage") {
  printThresholds(await getCoverageThresholds(), field);
} else if (command === "duplication") {
  printThresholds(await getDuplicationThresholds(), field);
} else {
  console.error(
    "Usage: node scripts/build-and-release/get-thresholds.ts <coverage|duplication> [field]",
  );
  process.exit(1);
}
