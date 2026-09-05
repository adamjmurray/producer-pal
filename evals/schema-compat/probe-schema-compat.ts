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
 * Run: node --env-file=.env evals/schema-compat/probe-schema-compat.ts [models...] [flags]
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
import {
  type CellResult,
  numArg,
  runProbeMatrix,
  truncate,
} from "./probe-report.ts";
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

/**
 * Resolve a model argument to an AI SDK LanguageModel. Handles Mistral natively
 * (the eval provider factory omits it) and delegates the rest to the factory.
 * @param arg - provider/model or prefix-inferred model string
 * @returns AI SDK LanguageModel
 */
function resolveModel(arg: string): Promise<LanguageModel> {
  if (arg.startsWith("mistral/")) {
    const model = arg.slice("mistral/".length);
    const apiKey = process.env.MISTRAL_KEY;

    if (!apiKey) throw new Error("API key for Mistral is not set");

    return Promise.resolve(createMistral({ apiKey })(model));
  }

  const { provider, model } = parseModelArg(arg);

  return Promise.resolve(createProviderModel(provider, model));
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

  return {
    status: variant.check(input) ? "ok" : "wrong-shape",
    detail: truncate(JSON.stringify(input)),
  };
}

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

const models = process.argv.slice(2).filter((a) => !a.startsWith("--"));

await runProbeMatrix<LanguageModel>({
  modelArgs: models.length > 0 ? models : defaultModels(),
  variants: VARIANTS,
  repeats: REPEATS,
  settings: [
    `Tool choice: ${TOOL_CHOICE} | repeats: ${REPEATS} | temperature: ` +
      `${TEMPERATURE ?? "provider default"} (cell shows worst of N draws)`,
  ],
  prepareRow: resolveModel,
  draw: probe,
});
