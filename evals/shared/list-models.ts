// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * List available models for a provider via the provider's live API.
 *
 * Shared by the chat CLI (evals/chat) and the eval CLI (evals/scenarios).
 * Listing always prints results and the caller exits — it never starts a chat
 * or an eval run.
 */

import { type EvalProvider } from "#evals/scenarios/types.ts";
import {
  PROVIDERS,
  PROVIDER_CONFIGS,
  validateApiKey,
} from "#evals/shared/provider-configs.ts";

/** OpenRouter exposes hundreds of models; cap the listing to keep it usable. */
const OPENROUTER_MODEL_CAP = 50;

const LOCAL_DEFAULT_BASE_URL = "http://localhost:11434/v1";

interface ListModelsOptions {
  /** Base URL for the local OpenAI-compatible server (chat CLI --base-url). */
  baseUrl?: string;
}

/**
 * Print models for a provider, or the provider list when no provider is given.
 *
 * @param arg - Provider name, or true when --list-models had no value
 * @param options - Listing options
 * @returns Process exit code (0 on success, 1 for an unknown provider)
 */
export async function listModels(
  arg: string | boolean,
  options: ListModelsOptions = {},
): Promise<number> {
  if (typeof arg !== "string" || arg === "") {
    console.log("A provider is required. Available providers:\n");
    console.log(formatProviderList());

    return 0;
  }

  if (!isValidProvider(arg)) {
    console.error(`Unknown provider: ${arg}. Valid: ${PROVIDERS.join(", ")}`);

    return 1;
  }

  let allModels: string[];

  try {
    allModels = await fetchModelsForProvider(arg, options);
  } catch (error) {
    console.error(`Failed to list models for ${arg}: ${describeError(error)}`);

    return 1;
  }

  const cap = arg === "openrouter" ? OPENROUTER_MODEL_CAP : null;
  const shown = cap != null ? allModels.slice(0, cap) : allModels;
  const countLabel =
    cap != null && allModels.length > cap
      ? `showing ${shown.length} of ${allModels.length}`
      : `${shown.length}`;

  console.log(`Available models for ${arg} (${countLabel}):`);

  for (const model of shown) {
    console.log(`  ${model}`);
  }

  return 0;
}

/**
 * Format the provider list, annotating each with its default model.
 *
 * @returns Multi-line provider listing
 */
export function formatProviderList(): string {
  return PROVIDERS.map((provider) => {
    const { defaultModel } = PROVIDER_CONFIGS[provider];
    const suffix = defaultModel ? ` (default: ${defaultModel})` : "";

    return `  ${provider}${suffix}`;
  }).join("\n");
}

/**
 * Describe an error for CLI output, unwrapping a `fetch failed` cause
 * (e.g. "connect ECONNREFUSED") so network errors are actionable.
 *
 * @param error - Caught error value
 * @returns Human-readable message (no stack trace)
 */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const detail = causeDetail((error as { cause?: unknown }).cause);

  return detail ? `${error.message} (${detail})` : error.message;
}

/**
 * Extract an actionable detail from an error's cause. `fetch failed` wraps the
 * underlying connection error in an AggregateError whose own message is empty,
 * so fall back to its first sub-error or its error code.
 *
 * @param cause - The `.cause` of a caught error
 * @returns A short detail string, or "" when none is available
 */
function causeDetail(cause: unknown): string {
  if (!(cause instanceof Error)) {
    return "";
  }

  if (cause.message) {
    return cause.message;
  }

  const errors = (cause as { errors?: unknown }).errors;

  if (Array.isArray(errors)) {
    const sub = errors.find((e) => e instanceof Error && e.message);

    if (sub instanceof Error) {
      return sub.message;
    }
  }

  const code = (cause as { code?: unknown }).code;

  return typeof code === "string" ? code : "";
}

/**
 * Type guard for a known provider name.
 *
 * @param value - Candidate provider string
 * @returns True when the value is a known provider
 */
function isValidProvider(value: string): value is EvalProvider {
  return (PROVIDERS as string[]).includes(value);
}

/**
 * Fetch available model ids for a provider from its live API.
 *
 * @param provider - Provider to query
 * @param options - Listing options
 * @returns Sorted list of model ids
 */
async function fetchModelsForProvider(
  provider: EvalProvider,
  options: ListModelsOptions,
): Promise<string[]> {
  switch (provider) {
    case "anthropic":
      return await fetchOpenAiStyleIds(
        "https://api.anthropic.com/v1/models?limit=1000",
        {
          "x-api-key": validateApiKey(PROVIDER_CONFIGS.anthropic),
          "anthropic-version": "2023-06-01",
        },
      );

    case "google":
      return await fetchGoogleModels();

    case "openai":
      return await fetchOpenAiStyleIds("https://api.openai.com/v1/models", {
        Authorization: `Bearer ${validateApiKey(PROVIDER_CONFIGS.openai)}`,
      });

    case "openrouter":
      return await fetchOpenAiStyleIds("https://openrouter.ai/api/v1/models", {
        Authorization: `Bearer ${validateApiKey(PROVIDER_CONFIGS.openrouter)}`,
      });

    case "local": {
      const baseUrl =
        options.baseUrl ?? process.env.LOCAL_BASE_URL ?? LOCAL_DEFAULT_BASE_URL;

      return await fetchOpenAiStyleIds(`${baseUrl}/models`, {
        Authorization: `Bearer ${validateApiKey(PROVIDER_CONFIGS.local)}`,
      });
    }

    default: {
      const exhaustive: never = provider;

      throw new Error(`Unknown provider: ${String(exhaustive)}`);
    }
  }
}

/**
 * Fetch model ids from an OpenAI-style `{ data: [{ id }] }` endpoint.
 *
 * @param url - Models endpoint URL
 * @param headers - Request headers (auth)
 * @returns Sorted list of model ids
 */
async function fetchOpenAiStyleIds(
  url: string,
  headers: Record<string, string>,
): Promise<string[]> {
  const body = (await fetchJson(url, headers)) as {
    data?: { id?: string }[];
  };

  return (body.data ?? [])
    .map((entry) => entry.id ?? "")
    .filter(Boolean)
    .sort();
}

/**
 * Fetch Gemini model names, stripping the `models/` path prefix.
 *
 * @returns Sorted list of model ids
 */
async function fetchGoogleModels(): Promise<string[]> {
  const apiKey = validateApiKey(PROVIDER_CONFIGS.google);
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models" +
    `?pageSize=1000&key=${apiKey}`;
  const body = (await fetchJson(url, {})) as {
    models?: { name?: string }[];
  };

  return (body.models ?? [])
    .map((entry) => (entry.name ?? "").replace(/^models\//, ""))
    .filter(Boolean)
    .sort();
}

/**
 * Fetch and parse JSON, throwing a readable error on a non-OK response.
 *
 * @param url - Request URL
 * @param headers - Request headers
 * @returns Parsed JSON body
 */
async function fetchJson(
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText}`,
    );
  }

  return await response.json();
}
