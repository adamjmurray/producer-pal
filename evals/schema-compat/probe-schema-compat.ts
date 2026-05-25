// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * One-off probe: do LLM providers accept (and correctly fill) richer tool-input
 * schema shapes than our "comma-separated strings only" convention assumes?
 *
 * Bypasses MCP and Ableton entirely. Feeds hand-written JSON Schema straight to
 * the AI SDK via jsonSchema() (the same wire format evals/chat/mcp.ts sends),
 * using tools with NO execute so each model emits exactly one tool call and
 * stops. For each model x schema-variant we record whether the provider:
 *   ACCEPTED the schema (no API/schema error), and
 *   FILLED it in a structurally correct shape (per-variant check()).
 *
 * The variant corpus lives in ./schema-compat-variants.ts.
 *
 * Run: npx tsx --env-file=.env evals/schema-compat/probe-schema-compat.ts [models...] [flags]
 *   models: provider/model or prefix-inferred (e.g. gemini-3.5-flash,
 *           mistral/mistral-small-latest, openrouter/anthropic/claude-haiku-4.5).
 *           Defaults to the supported providers (Gemini, OpenAI, Mistral,
 *           OpenRouter). Models whose API key is missing are skipped.
 *   flags:  --repeat=N  draws per cell (default 3; controls for sampling noise)
 *           --temp=N    sampling temperature (default: provider default; forcing
 *                       0 breaks some reasoning models, so repeats — not temp 0 —
 *                       are how this probe controls for noise)
 *           --auto      let the model decide whether to call (see TOOL_CHOICE)
 *
 * See README.md in this directory for a checked-in results snapshot.
 */

import { createMistral } from "@ai-sdk/mistral";
import { generateText, jsonSchema, tool, type LanguageModel } from "ai";
import { createProviderModel } from "#evals/chat/provider.ts";
import { parseModelArg } from "#evals/shared/parse-model-arg.ts";
import {
  GEMINI_CONFIG,
  OPENAI_CONFIG,
  OPENROUTER_CONFIG,
} from "#evals/shared/provider-configs.ts";
import { VARIANTS, type Args, type Variant } from "./schema-compat-variants.ts";

/** Per-call wall-clock cap so a hung/rate-limited model can't stall the run. */
const PROBE_TIMEOUT_MS = 60_000;
/** Headroom so reasoning models can think before emitting the tool call. */
const MAX_OUTPUT_TOKENS = 8192;
/**
 * "required" guarantees a tool call (best schema signal) but some endpoints
 * reject it; pass --auto to let the model decide (a "no-call" then means it
 * chatted instead, not a schema failure).
 */
const TOOL_CHOICE: "auto" | "required" = process.argv.includes("--auto")
  ? "auto"
  : "required";
/**
 * Independent draws per (model, variant). n=1 can't be told from sampling
 * noise; repeats expose it (a cell that flips status across draws is flaky, not
 * a clean pass). Override with --repeat=N.
 */
const REPEATS = Math.max(1, Math.floor(numArg("--repeat=") ?? 3));
/**
 * Sampling temperature. Left unset (provider default) by default: forcing 0 on
 * reasoning models (e.g. gpt-5-nano) gets rejected by some endpoints, which
 * would show as false `rejected` cells. Repeats — not temp 0 — are how this
 * probe controls for noise. Override with --temp=N when the model allows it.
 */
const TEMPERATURE = numArg("--temp=");

type Status = "ok" | "wrong-shape" | "rejected" | "no-call" | "no-key";

interface CellResult {
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

/**
 * Collapse repeated draws into one cell: status is the worst observed (so flaky
 * cells can't masquerade as clean), detail carries the full distribution plus a
 * representative input from the worst draw.
 * @param results - One CellResult per draw
 * @returns Aggregated CellResult
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
 * Parse a numeric CLI flag like --repeat=3 or --temp=0; absent flag is undefined.
 * @param flag - Flag prefix including trailing '='
 * @returns Parsed number, or undefined when the flag is absent/unparseable
 */
function numArg(flag: string): number | undefined {
  const arg = process.argv.find((a) => a.startsWith(flag));

  if (arg == null) return undefined;

  const n = Number(arg.slice(flag.length));

  return Number.isFinite(n) ? n : undefined;
}

/**
 * Resolve a model argument to an AI SDK LanguageModel. Handles Mistral natively
 * (the eval provider factory omits it) and delegates the rest to the factory.
 * @param arg - provider/model or prefix-inferred model string
 * @returns AI SDK LanguageModel
 */
function resolveModel(arg: string): LanguageModel {
  if (arg.startsWith("mistral/")) {
    const model = arg.slice("mistral/".length);
    const apiKey = process.env.MISTRAL_KEY;

    if (!apiKey) throw new Error("API key for Mistral is not set");

    return createMistral({ apiKey })(model);
  }

  const { provider, model } = parseModelArg(arg);

  return createProviderModel(provider, model);
}

/**
 * Run a single (model, variant) probe.
 * @param model - Resolved AI SDK LanguageModel
 * @param variant - Schema variant to probe
 * @returns Status and a short detail string (args JSON or error message)
 */
async function probe(
  model: LanguageModel,
  variant: Variant,
): Promise<CellResult> {
  const result = await generateText({
    model,
    toolChoice: TOOL_CHOICE,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    temperature: TEMPERATURE,
    abortSignal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    prompt: variant.prompt,
    tools: {
      [variant.toolName]: tool({
        description: `Probe tool for ${variant.id}`,
        inputSchema: jsonSchema(variant.schema),
      }),
    },
  });

  const call = result.toolCalls[0];

  if (call == null) {
    return { status: "no-call", detail: truncate(result.text) };
  }

  const input = (call.input ?? {}) as Args;
  const detail = truncate(JSON.stringify(input));

  return { status: variant.check(input) ? "ok" : "wrong-shape", detail };
}

/**
 * Truncate a string for compact terminal output.
 * @param s - Input string
 * @param n - Max length
 * @returns Truncated single-line string
 */
function truncate(s: string, n = 160): string {
  const flat = s.replaceAll(/\s+/g, " ").trim();

  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

const SYMBOL: Record<Status, string> = {
  ok: "✓",
  "wrong-shape": "~",
  rejected: "✗",
  "no-call": "·",
  "no-key": "-",
};

/**
 * Resolve default model list from provider configs (one per provider).
 * @returns Array of provider/model argument strings
 */
function defaultModels(): string[] {
  return [
    `google/${GEMINI_CONFIG.defaultModel}`,
    `openai/${OPENAI_CONFIG.defaultModel}`,
    "mistral/mistral-small-latest",
    `openrouter/${OPENROUTER_CONFIG.defaultModel}`,
  ];
}

/**
 * Probe every requested model against every schema variant and print a report.
 * @returns Promise that resolves when the report is printed
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const modelArgs = args.length > 0 ? args : defaultModels();

  console.log("Schema compatibility probe");
  console.log(`Variants: ${VARIANTS.map((v) => v.id).join(", ")}\n`);
  for (const v of VARIANTS) console.log(`  ${v.id}: ${v.tests}`);
  console.log("\nLegend: ✓ ok  ~ wrong-shape  ✗ rejected  · no-call  - no-key");
  console.log(
    `Tool choice: ${TOOL_CHOICE} | repeats: ${REPEATS} | temperature: ` +
      `${TEMPERATURE ?? "provider default"} (cell shows worst of N draws)\n`,
  );

  const details: string[] = [];
  const header = ["model".padEnd(42), ...VARIANTS.map((v) => v.id.padEnd(22))];

  console.log(header.join(""));
  console.log("-".repeat(header.join("").length));

  for (const modelArg of modelArgs) {
    const row = [modelArg.padEnd(42)];
    let model: LanguageModel;

    try {
      model = resolveModel(modelArg);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      row.push(...VARIANTS.map(() => `${SYMBOL["no-key"]} no-key`.padEnd(22)));
      details.push(`[${modelArg}] unresolved: ${truncate(message)}`);
      console.log(row.join(""));
      continue;
    }

    for (const variant of VARIANTS) {
      const cell = await runCell(model, variant, modelArg, details);

      row.push((SYMBOL[cell.status] + " " + cell.status).padEnd(22));
    }

    console.log(row.join(""));
  }

  console.log("\n=== details ===\n");
  console.log(details.join("\n"));
}

/**
 * Run one (model, variant) cell REPEATS times, aggregate the draws, and append
 * a details line carrying the full distribution.
 * @param model - Resolved AI SDK LanguageModel
 * @param variant - Schema variant
 * @param modelArg - Original model argument (for labeling)
 * @param details - Mutable details accumulator
 * @returns The aggregated cell result
 */
async function runCell(
  model: LanguageModel,
  variant: Variant,
  modelArg: string,
  details: string[],
): Promise<CellResult> {
  const draws: CellResult[] = [];

  for (let n = 0; n < REPEATS; n++) draws.push(await runOnce(model, variant));

  const cell = aggregate(draws);

  details.push(`[${modelArg} | ${variant.id}] ${cell.status}: ${cell.detail}`);

  return cell;
}

/**
 * One probe attempt, converting thrown errors into a rejected/no-key result.
 * @param model - Resolved AI SDK LanguageModel
 * @param variant - Schema variant
 * @returns The single-draw cell result
 */
async function runOnce(
  model: LanguageModel,
  variant: Variant,
): Promise<CellResult> {
  try {
    return await probe(model, variant);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status: Status = /api key/i.test(message) ? "no-key" : "rejected";

    return { status, detail: truncate(message) };
  }
}

await main();
