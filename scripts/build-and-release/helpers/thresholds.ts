// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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

export interface DuplicationThresholds {
  source: number;
  tests: number;
  scripts: number;
  evals: number;
  e2e: number;
}

/**
 * Reads coverage thresholds from vitest config
 *
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
 *
 * @returns Duplication threshold values
 */
export async function getDuplicationThresholds(): Promise<DuplicationThresholds> {
  const [srcConfig, testsConfig, scriptsConfig, evalsConfig, e2eConfig] =
    await Promise.all([
      readFile(join(configDir, ".jscpd.json"), "utf-8").then(JSON.parse),
      readFile(join(configDir, ".jscpd-tests.json"), "utf-8").then(JSON.parse),
      readFile(join(configDir, ".jscpd-scripts.json"), "utf-8").then(
        JSON.parse,
      ),
      readFile(join(configDir, ".jscpd-evals.json"), "utf-8").then(JSON.parse),
      readFile(join(configDir, ".jscpd-e2e.json"), "utf-8").then(JSON.parse),
    ]);

  return {
    source: srcConfig.threshold,
    tests: testsConfig.threshold,
    scripts: scriptsConfig.threshold,
    evals: evalsConfig.threshold,
    e2e: e2eConfig.threshold,
  };
}
