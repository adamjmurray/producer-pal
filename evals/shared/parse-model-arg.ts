// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared parser for model arguments in CLI tools
 *
 * Supports two formats:
 * - provider/model: explicit provider (e.g., "google/gemini-2.0-flash")
 * - model: infer provider from prefix (e.g., "claude-sonnet-4-5" → anthropic)
 */

import { type Command } from "commander";
import { type EvalProvider } from "#evals/scenarios/types.ts";
import { PROVIDERS } from "#evals/shared/provider-configs.ts";

export interface ModelSpec {
  provider: EvalProvider;
  model: string;
}

/** Suffix appended to model-related CLI errors pointing at --list-models. */
export const LIST_MODELS_HINT =
  "Use --list-models [provider] to list available models.";

/**
 * Parse a model argument into provider and model
 *
 * @param arg - Model argument (e.g., "claude-sonnet-4-5" or "google/gemini-2.0-flash")
 * @returns Parsed provider and model
 * @throws Error if provider-only, unknown prefix, or invalid provider
 */
export function parseModelArg(arg: string): ModelSpec {
  const slashIndex = arg.indexOf("/");

  if (slashIndex !== -1) {
    // Explicit provider/model - split on first / only
    const provider = arg.slice(0, slashIndex);
    const model = arg.slice(slashIndex + 1);

    validateProvider(provider);

    if (model === "") {
      throw new Error(`Missing model after "${provider}/". Specify a model.`);
    }

    return { provider: provider as EvalProvider, model };
  }

  // Model-only: infer provider from prefix
  return inferProviderFromModel(arg);
}

/**
 * Parse a model argument, reporting a bad one as a CLI usage error with the
 * --list-models hint rather than letting it throw past commander as a stack
 * trace. Does not return on failure — commander exits.
 *
 * @param program - The commander program the argument came from
 * @param arg - Model argument to parse
 * @returns Parsed provider and model
 */
export function parseModelArgOrExit(program: Command, arg: string): ModelSpec {
  try {
    return parseModelArg(arg);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return program.error(`${message} ${LIST_MODELS_HINT}`);
  }
}

/**
 * Infer provider from model name prefix
 *
 * @param model - Model name
 * @returns ModelSpec with inferred provider
 * @throws Error if provider-only input or unknown prefix
 */
function inferProviderFromModel(model: string): ModelSpec {
  // Provider-only FIRST, before prefix inference: `claude-code` is both a
  // provider name and a `claude-` prefix match, and inferring would silently
  // route it to the metered Anthropic API — the exact thing someone reaching
  // for the subscription CLI is trying to avoid.
  if (PROVIDERS.includes(model as EvalProvider)) {
    throw new Error(`Provider-only not allowed: "${model}". Specify a model.`);
  }

  if (model.startsWith("claude-")) {
    return { provider: "anthropic", model };
  }

  if (model.startsWith("gpt-")) {
    return { provider: "openai", model };
  }

  if (model.startsWith("gemini-")) {
    return { provider: "google", model };
  }

  throw new Error(
    `Unknown model prefix: "${model}". Use provider/model format.`,
  );
}

/**
 * Validate that a provider string is valid
 *
 * @param provider - Provider string to validate
 * @throws Error if provider is not valid
 */
function validateProvider(provider: string): void {
  if (!PROVIDERS.includes(provider as EvalProvider)) {
    throw new Error(
      `Unknown provider: ${provider}. Valid: ${PROVIDERS.join(", ")}`,
    );
  }
}
