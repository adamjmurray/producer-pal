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
 * Run: npx tsx --env-file=.env evals/schema-compat/probe-schema-compat.ts [models...]
 *   models: provider/model or prefix-inferred (e.g. gemini-3.5-flash,
 *           mistral/mistral-small-latest, openrouter/anthropic/claude-haiku-4.5).
 *           Defaults to the supported providers (Gemini, OpenAI, Mistral,
 *           OpenRouter). Models whose API key is missing are skipped.
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

type JsonSchemaInput = Parameters<typeof jsonSchema>[0];
type Args = Record<string, unknown>;

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

interface Variant {
  id: string;
  toolName: string;
  /** What construct this probes, for the report. */
  tests: string;
  schema: JsonSchemaInput;
  prompt: string;
  /** Structural correctness of the model's tool-call input. */
  check: (input: Args) => boolean;
}

/**
 * @param x - Value to test
 * @returns True if x is a string
 */
const isStr = (x: unknown): x is string => typeof x === "string";

/**
 * @param x - Value to test
 * @returns True if x is an array of strings
 */
const isStrArray = (x: unknown): boolean => Array.isArray(x) && x.every(isStr);

/**
 * @param x - Value to test
 * @param keys - Keys that must be present
 * @returns True if x is a plain (non-array) object containing every key
 */
const isParamMap = (x: unknown, keys: string[]): boolean =>
  x != null &&
  typeof x === "object" &&
  !Array.isArray(x) &&
  keys.every((k) => k in (x as Args));

// Note: most variants omit additionalProperties on purpose so a clean shape is
// probed without confounding the construct-acceptance signal. The two object-map
// variants are the exception — they exist specifically to probe dynamic-key
// objects (what `z.record(...)` emits). Finding: Gemini does NOT reject
// additionalProperties anymore, but it (and the bare-object fallback) silently
// fills `{}` — dropping every key. All other curated models fill it correctly.
// This is why update-device `params` stays an array<object{name,value}> rather
// than an object map: the map loses all params on Gemini with no error.
const VARIANTS: Variant[] = [
  {
    id: "array-of-strings",
    toolName: "record_actions",
    tests: "array<string> (baseline, == update-device 'actions')",
    schema: {
      type: "object",
      properties: { actions: { type: "array", items: { type: "string" } } },
      required: ["actions"],
    },
    prompt:
      "Record exactly these three device actions verbatim using record_actions: " +
      "reverse | warpAs(4) | setModulation('Osc 1 Pos','Env 2',0.5)",
    check: (i) => isStrArray(i.actions) && (i.actions as unknown[]).length >= 3,
  },
  {
    id: "csv-string",
    toolName: "record_actions_csv",
    tests: "comma-separated string (current convention; commas-in-values fail)",
    schema: {
      type: "object",
      properties: {
        actions: {
          type: "string",
          description: "comma-separated list of actions",
        },
      },
      required: ["actions"],
    },
    prompt:
      "Record exactly these three device actions verbatim using record_actions_csv: " +
      "reverse | warpAs(4) | setModulation('Osc 1 Pos','Env 2',0.5)",
    // "Correct" is impossible to recover unambiguously — the 3rd value has
    // commas. We mark pass only if it's a string (acceptance), and the details
    // dump shows how the ambiguity bites.
    check: (i) => isStr(i.actions),
  },
  {
    id: "string-or-array-union",
    toolName: "record_action",
    tests: "anyOf[string, array<string>] (THE concern)",
    schema: {
      type: "object",
      properties: {
        action: {
          anyOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
        },
      },
      required: ["action"],
    },
    prompt:
      "Record these two device actions using record_action: reverse, warpAs(4)",
    check: (i) => isStr(i.action) || isStrArray(i.action),
  },
  {
    id: "nested-object-array",
    toolName: "build_kit",
    tests: "array<object{note,sample,name}> (drum-kit spec)",
    schema: {
      type: "object",
      properties: {
        pads: {
          type: "array",
          items: {
            type: "object",
            properties: {
              note: { type: "string" },
              sample: { type: "string" },
              name: { type: "string" },
            },
            required: ["note", "sample", "name"],
          },
        },
      },
      required: ["pads"],
    },
    prompt:
      "Build a drum kit with build_kit using these three pads: " +
      "C1 -> /samples/kick.wav named Kick; " +
      "D1 -> /samples/snare.wav named Snare; " +
      "F#1 -> /samples/hihat.wav named HiHat",
    check: (i) =>
      Array.isArray(i.pads) &&
      i.pads.length >= 3 &&
      i.pads.every(
        (p) =>
          p != null &&
          isStr((p as Args).note) &&
          isStr((p as Args).sample) &&
          isStr((p as Args).name),
      ),
  },
  {
    id: "object-map",
    toolName: "set_params_map",
    tests:
      "object{additionalProperties:string} (proposed update-device 'params' map)",
    schema: {
      type: "object",
      properties: {
        params: {
          type: "object",
          additionalProperties: { type: "string" },
        },
      },
      required: ["params"],
    },
    prompt:
      "Set these three device parameters using set_params_map: " +
      "Frequency to 500, Resonance to 20, Drive to 30%.",
    check: (i) => isParamMap(i.params, ["Frequency", "Resonance", "Drive"]),
  },
  {
    id: "object-map-bare",
    toolName: "set_params_bare",
    tests: "object{} no additionalProperties (free-form fallback)",
    schema: {
      type: "object",
      properties: {
        params: { type: "object" },
      },
      required: ["params"],
    },
    prompt:
      "Set these three device parameters using set_params_bare: " +
      "Frequency to 500, Resonance to 20, Drive to 30%.",
    check: (i) => isParamMap(i.params, ["Frequency", "Resonance", "Drive"]),
  },
  {
    id: "live-api-value-union",
    toolName: "set_value",
    tests: "anyOf[string,number,boolean,array<number>] (== live-api 'value')",
    schema: {
      type: "object",
      properties: {
        value: {
          anyOf: [
            { type: "string" },
            { type: "number" },
            { type: "boolean" },
            { type: "array", items: { type: "number" } },
          ],
        },
      },
      required: ["value"],
    },
    prompt:
      "Set the parameter to the list of numbers 0.1, 0.2, 0.3 using set_value.",
    check: (i) =>
      Array.isArray(i.value) && i.value.every((x) => typeof x === "number"),
  },
];

type Status = "ok" | "wrong-shape" | "rejected" | "no-call" | "no-key";

interface CellResult {
  status: Status;
  detail: string;
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
  const args = process.argv.slice(2).filter((a) => a !== "--auto");
  const modelArgs = args.length > 0 ? args : defaultModels();

  console.log("Schema compatibility probe");
  console.log(`Variants: ${VARIANTS.map((v) => v.id).join(", ")}\n`);
  for (const v of VARIANTS) console.log(`  ${v.id}: ${v.tests}`);
  console.log("\nLegend: ✓ ok  ~ wrong-shape  ✗ rejected  · no-call  - no-key");
  console.log(`Tool choice: ${TOOL_CHOICE}\n`);

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
 * Run one cell, converting thrown errors into a rejected/no-key result and
 * appending a details line.
 * @param model - Resolved AI SDK LanguageModel
 * @param variant - Schema variant
 * @param modelArg - Original model argument (for labeling)
 * @param details - Mutable details accumulator
 * @returns The cell result
 */
async function runCell(
  model: LanguageModel,
  variant: Variant,
  modelArg: string,
  details: string[],
): Promise<CellResult> {
  let cell: CellResult;

  try {
    cell = await probe(model, variant);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status: Status = /api key/i.test(message) ? "no-key" : "rejected";

    cell = { status, detail: truncate(message) };
  }

  details.push(`[${modelArg} | ${variant.id}] ${cell.status}: ${cell.detail}`);

  return cell;
}

await main();
