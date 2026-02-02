/**
 * Shared parser for model arguments in CLI tools
 *
 * Supports two formats:
 * - provider/model: explicit provider (e.g., "google/gemini-2.0-flash")
 * - model: infer provider from prefix (e.g., "claude-sonnet-4-5" → anthropic)
 */

import type { EvalProvider } from "#evals/eval/types.ts";

export interface ModelSpec {
  provider: EvalProvider;
  model: string;
}

const VALID_PROVIDERS: EvalProvider[] = [
  "anthropic",
  "google",
  "openai",
  "openrouter",
];

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

    return { provider: provider as EvalProvider, model };
  }

  // Model-only: infer provider from prefix
  return inferProviderFromModel(arg);
}

/**
 * Infer provider from model name prefix
 *
 * @param model - Model name
 * @returns ModelSpec with inferred provider
 * @throws Error if provider-only input or unknown prefix
 */
function inferProviderFromModel(model: string): ModelSpec {
  if (model.startsWith("claude-")) {
    return { provider: "anthropic", model };
  }

  if (model.startsWith("gpt-")) {
    return { provider: "openai", model };
  }

  if (model.startsWith("gemini-")) {
    return { provider: "google", model };
  }

  // Check if it's a provider-only input (error)
  if (VALID_PROVIDERS.includes(model as EvalProvider)) {
    throw new Error(`Provider-only not allowed: "${model}". Specify a model.`);
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
  if (!VALID_PROVIDERS.includes(provider as EvalProvider)) {
    throw new Error(
      `Unknown provider: ${provider}. Valid: ${VALID_PROVIDERS.join(", ")}`,
    );
  }
}
