// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared scoring and reporting for the schema-compat probes.
 *
 * Both probes ask the same question of the same variant corpus and differ only
 * in how they reach a model — the AI SDK directly, or a coding-agent CLI over
 * MCP. Everything after "what did it send us" is the same, so it lives here:
 * the status vocabulary, worst-of-N aggregation, and the model x variant table.
 */

import { type Variant } from "./schema-compat-variants.ts";

export type Status = "ok" | "wrong-shape" | "rejected" | "no-call" | "no-key";

export interface CellResult {
  status: Status;
  detail: string;
}

/** Worst-first: a flaky cell is reported by its most severe draw, not its best. */
const SEVERITY: Status[] = [
  "rejected",
  "no-key",
  "no-call",
  "wrong-shape",
  "ok",
];

const SYMBOL: Record<Status, string> = {
  ok: "✓",
  "wrong-shape": "~",
  rejected: "✗",
  "no-call": "·",
  "no-key": "-",
};

export const LEGEND =
  "Legend: ✓ ok  ~ wrong-shape  ✗ rejected  · no-call  - no-key";

export interface ProbeMatrix<Row> {
  /** One table row each, in order. */
  modelArgs: string[];
  variants: Variant[];
  /** Independent draws per cell; the cell reports the worst. */
  repeats: number;
  /** Lines printed under the legend, describing this probe's settings. */
  settings: string[];
  /**
   * Per-row setup — resolving a model, a transport, an API key. Throwing here
   * fails the whole row as `no-key` rather than repeating the failure per cell.
   */
  prepareRow: (modelArg: string) => Promise<Row>;
  /** One draw. Throwing counts as `rejected` (or `no-key`, if it reads like one). */
  draw: (row: Row, variant: Variant) => Promise<CellResult>;
}

/**
 * Run every (model, variant) cell and print the report.
 * @param matrix - The models, variants, and how to draw one cell
 * @returns Promise resolving once the report is printed
 */
export async function runProbeMatrix<Row>(
  matrix: ProbeMatrix<Row>,
): Promise<void> {
  const { modelArgs, variants } = matrix;

  console.log("Schema compatibility probe");
  console.log(`Variants: ${variants.map((v) => v.id).join(", ")}\n`);
  for (const v of variants) console.log(`  ${v.id}: ${v.tests}`);
  console.log(`\n${LEGEND}`);
  for (const line of matrix.settings) console.log(line);
  console.log();

  const details: string[] = [];
  const header = ["model".padEnd(42), ...variants.map((v) => v.id.padEnd(22))];

  console.log(header.join(""));
  console.log("-".repeat(header.join("").length));

  for (const modelArg of modelArgs) {
    await runRow(matrix, modelArg, details);
  }

  console.log("\n=== details ===\n");
  console.log(details.join("\n"));
}

/**
 * Truncate a string to one compact line for terminal output.
 * @param s - Input string
 * @param n - Max length
 * @returns Truncated single-line string
 */
export function truncate(s: string, n = 160): string {
  const flat = s.replaceAll(/\s+/g, " ").trim();

  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

/**
 * Parse a numeric CLI flag like --repeat=3 or --temp=0; absent flag is undefined.
 * @param flag - Flag prefix including trailing '='
 * @returns Parsed number, or undefined when the flag is absent or unparseable
 */
export function numArg(flag: string): number | undefined {
  const arg = process.argv.find((a) => a.startsWith(flag));

  if (arg == null) return undefined;

  const n = Number(arg.slice(flag.length));

  return Number.isFinite(n) ? n : undefined;
}

/**
 * Turn a thrown error into a failed cell, telling a missing key from a refusal.
 * @param error - The thrown value
 * @returns The failed cell result
 */
export function errorCell(error: unknown): CellResult {
  const message = error instanceof Error ? error.message : String(error);
  const status: Status = /api key/i.test(message) ? "no-key" : "rejected";

  return { status, detail: truncate(message) };
}

/**
 * Run one model's row, printing it and appending its details lines.
 * @param matrix - The probe matrix
 * @param modelArg - The model argument naming this row
 * @param details - Mutable details accumulator
 */
async function runRow<Row>(
  matrix: ProbeMatrix<Row>,
  modelArg: string,
  details: string[],
): Promise<void> {
  const cells = [modelArg.padEnd(42)];

  let row: Row;

  try {
    row = await matrix.prepareRow(modelArg);
  } catch (error) {
    const { detail } = errorCell(error);

    cells.push(...matrix.variants.map(() => cell("no-key")));
    details.push(`[${modelArg}] unresolved: ${detail}`);
    console.log(cells.join(""));

    return;
  }

  for (const variant of matrix.variants) {
    const result = await runCell(matrix, row, variant);

    cells.push(cell(result.status));
    details.push(
      `[${modelArg} | ${variant.id}] ${result.status}: ${result.detail}`,
    );
  }

  console.log(cells.join(""));
}

/**
 * Draw one cell `repeats` times and collapse the draws.
 * @param matrix - The probe matrix
 * @param row - The prepared row context
 * @param variant - The variant under test
 * @returns The aggregated cell result
 */
async function runCell<Row>(
  matrix: ProbeMatrix<Row>,
  row: Row,
  variant: Variant,
): Promise<CellResult> {
  const draws: CellResult[] = [];

  for (let n = 0; n < matrix.repeats; n++) {
    try {
      draws.push(await matrix.draw(row, variant));
    } catch (error) {
      draws.push(errorCell(error));
    }
  }

  return aggregate(draws);
}

/**
 * Collapse repeated draws into one cell: the status is the worst observed (so a
 * flaky cell can't pass as clean) and the detail carries the full distribution
 * plus a representative input from the worst draw.
 * @param results - One CellResult per draw
 * @returns The aggregated CellResult
 */
function aggregate(results: CellResult[]): CellResult {
  const counts = new Map<Status, number>();

  for (const r of results)
    counts.set(r.status, (counts.get(r.status) ?? 0) + 1);

  const worst = SEVERITY.find((s) => counts.has(s)) ?? "ok";
  const dist = SEVERITY.filter((s) => counts.has(s))
    .map((s) => `${s} ${counts.get(s)}/${results.length}`)
    .join(", ");
  const rep = results.find((r) => r.status === worst);

  return { status: worst, detail: `[${dist}] ${rep?.detail ?? ""}` };
}

/**
 * Format one table cell.
 * @param status - The cell's status
 * @returns The padded cell text
 */
function cell(status: Status): string {
  return `${SYMBOL[status]} ${status}`.padEnd(22);
}
