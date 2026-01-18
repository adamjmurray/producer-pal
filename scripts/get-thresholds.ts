#!/usr/bin/env node
/**
 * Outputs coverage and duplication thresholds from config files.
 * Used by GitHub Actions to populate summary tables.
 *
 * Usage:
 *   node scripts/get-thresholds.ts coverage              # outputs all as JSON
 *   node scripts/get-thresholds.ts coverage statements   # outputs single value
 *   node scripts/get-thresholds.ts duplication           # outputs all as JSON
 *   node scripts/get-thresholds.ts duplication source    # outputs single value
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configDir = join(__dirname, "..", "config");

interface CoverageThresholds {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

interface DuplicationThresholds {
  source: number;
  tests: number;
  scripts: number;
}

async function getCoverageThresholds(): Promise<CoverageThresholds> {
  const vitestConfig = await readFile(
    join(configDir, "vitest.config.mjs"),
    "utf-8",
  );

  /**
   * Extracts a threshold from vitest config using regex.
   * Matches patterns like: statements: 97.8,
   * @param name - Threshold name to extract
   * @returns Extracted threshold value
   */
  const extractThreshold = (name: string): number => {
    const match = vitestConfig.match(new RegExp(`${name}:\\s*([\\d.]+)`));

    const value = match?.[1];

    if (!value) {
      throw new Error(
        `Failed to extract ${name} threshold from vitest.config.mjs`,
      );
    }

    return Number.parseFloat(value);
  };

  return {
    statements: extractThreshold("statements"),
    branches: extractThreshold("branches"),
    functions: extractThreshold("functions"),
    lines: extractThreshold("lines"),
  };
}

async function getDuplicationThresholds(): Promise<DuplicationThresholds> {
  const [srcConfig, testsConfig, scriptsConfig] = await Promise.all([
    readFile(join(configDir, ".jscpd.json"), "utf-8").then(JSON.parse),
    readFile(join(configDir, ".jscpd-tests.json"), "utf-8").then(JSON.parse),
    readFile(join(configDir, ".jscpd-scripts.json"), "utf-8").then(JSON.parse),
  ]);

  return {
    source: srcConfig.threshold,
    tests: testsConfig.threshold,
    scripts: scriptsConfig.threshold,
  };
}

const command = process.argv[2];
const field = process.argv[3];

if (command === "coverage") {
  const thresholds = await getCoverageThresholds();

  if (field) {
    if (!(field in thresholds)) {
      console.error(`Unknown coverage field: ${field}`);
      process.exit(1);
    }

    console.log(thresholds[field as keyof CoverageThresholds]);
  } else {
    console.log(JSON.stringify(thresholds));
  }
} else if (command === "duplication") {
  const thresholds = await getDuplicationThresholds();

  if (field) {
    if (!(field in thresholds)) {
      console.error(`Unknown duplication field: ${field}`);
      process.exit(1);
    }

    console.log(thresholds[field as keyof DuplicationThresholds]);
  } else {
    console.log(JSON.stringify(thresholds));
  }
} else {
  console.error(
    "Usage: node scripts/get-thresholds.ts <coverage|duplication> [field]",
  );
  process.exit(1);
}
