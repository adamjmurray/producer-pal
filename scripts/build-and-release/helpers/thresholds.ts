// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Readers for the code-quality thresholds held in vitest.config.ts and the
 * jscpd configs. Consumed by the get-thresholds CLI and the test-stats report.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../../..");
const configDir = join(rootDir, "config");

export interface CoverageThresholds {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

const DUPLICATION_CONFIGS = {
  source: ".jscpd.json",
  tests: ".jscpd-tests.json",
  scripts: ".jscpd-scripts.json",
  evals: ".jscpd-evals.json",
  e2e: ".jscpd-e2e.json",
  docs: ".jscpd-docs.json",
} as const;

export type DuplicationThresholds = Record<
  keyof typeof DUPLICATION_CONFIGS,
  number
>;

/**
 * Reads coverage thresholds from vitest config
 * @returns Coverage threshold values
 */
export async function getCoverageThresholds(): Promise<CoverageThresholds> {
  const vitestConfig = await readFile(
    join(rootDir, "vitest.config.ts"),
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
        `Failed to extract ${name} threshold from vitest.config.ts`,
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

/**
 * Reads duplication thresholds from jscpd config files
 * @returns Duplication threshold values
 */
export async function getDuplicationThresholds(): Promise<DuplicationThresholds> {
  const entries = await Promise.all(
    Object.entries(DUPLICATION_CONFIGS).map(async ([group, file]) => {
      const config = JSON.parse(await readFile(join(configDir, file), "utf-8"));

      return [group, config.threshold as number] as const;
    }),
  );

  return Object.fromEntries(entries) as DuplicationThresholds;
}
