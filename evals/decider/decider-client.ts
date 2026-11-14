// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Minimal client for a decider (TypeSafe AI's Jev, or a local model with the same
 * API): ask typed questions about a piece of state and get back probabilities.
 */

import { sleep } from "#evals/shared/sleep.ts";
import { resolveDecider, type DeciderProvider } from "./decider-provider.ts";

const MAX_RETRIES = 2;

/** A yes/no question. `noul` in the answer is P(yes). */
export interface DeciderNoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
}

/** A graded question; `criteria` lists the levels from low to high. */
export interface DeciderScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

export type DeciderQuestion = DeciderNoulQuestion | DeciderScoreQuestion;

export interface DeciderNoulAnswer {
  type: "noul";
  noul: number;
}

export interface DeciderScoreAnswer {
  type: "score";
  score: number;
  confidence: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
}

export type DeciderAnswer = DeciderNoulAnswer | DeciderScoreAnswer;

export interface DeciderResponse {
  model: string;
  answers: Record<string, DeciderAnswer>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    /** Actual cost in USD; only OpenRouter reports it */
    cost?: number;
  };
}

export interface AskDeciderOptions {
  /** Defaults to `jev-latest` on a hosted provider; Ollama needs one */
  model?: string;
  /** Defaults to the first hosted provider whose key is set (see `resolveDecider`) */
  provider?: DeciderProvider;
  /** Defaults to the provider's environment variable */
  apiKey?: string;
  /** Wait before retrying a 429/5xx, doubled per retry. Default 1000. */
  retryDelayMs?: number;
}

/** A non-2xx reply from the decider API. */
export class DeciderError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(`Decider API error ${status}: ${detail}`);
    this.name = "DeciderError";
    this.status = status;
  }
}

/**
 * Ask the decider a set of questions about some state.
 *
 * @param state - What the questions are about (string, object or array)
 * @param questions - Questions by id
 * @param options - Provider, model, key and retry settings
 * @returns The decider's answers by question id, plus token usage
 */
export async function askDecider(
  state: unknown,
  questions: Record<string, DeciderQuestion>,
  options: AskDeciderOptions = {},
): Promise<DeciderResponse> {
  const { url, apiKey, model } = resolveDecider(
    { provider: options.provider, model: options.model },
    options.apiKey,
  );

  const body = JSON.stringify({ model, state, questions });

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...(apiKey != null && { Authorization: `Bearer ${apiKey}` }),
        "Content-Type": "application/json",
      },
      body,
    });

    if (response.ok) {
      return (await response.json()) as DeciderResponse;
    }

    const retryable = response.status === 429 || response.status >= 500;

    if (!retryable || attempt >= MAX_RETRIES) {
      throw new DeciderError(response.status, await readDetail(response));
    }

    await sleep((options.retryDelayMs ?? 1000) * 2 ** attempt);
  }
}

/**
 * Pull the error text out of a failed response. Jev sends `{detail}` as a
 * string (400) or a list of problems (422); Ollama sends `{error}` as a string.
 *
 * @param response - The non-2xx response
 * @returns A readable error message
 */
async function readDetail(response: Response): Promise<string> {
  const text = await response.text();

  try {
    const { detail, error } = JSON.parse(text) as {
      detail?: unknown;
      error?: unknown;
    };

    if (typeof detail === "string") {
      return detail;
    }

    if (Array.isArray(detail)) {
      return detail
        .map((d: { loc?: unknown[]; msg?: string }) =>
          `${d.loc?.join(".") ?? ""} ${d.msg ?? ""}`.trim(),
        )
        .join("; ");
    }

    if (typeof error === "string") {
      return error;
    }
  } catch {
    // not JSON; fall through to the raw text
  }

  return text.slice(0, 500);
}
