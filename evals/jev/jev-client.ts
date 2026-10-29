// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Minimal client for TypeSafe AI's Jev model: ask typed questions about a
 * piece of state and get back probabilities.
 */

import { sleep } from "#evals/shared/sleep.ts";

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_MODEL = "jev-latest";
const MAX_RETRIES = 2;

/** A yes/no question. `noul` in the answer is P(yes). */
export interface JevNoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
}

/** A graded question; `criteria` lists the levels from low to high. */
export interface JevScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

export type JevQuestion = JevNoulQuestion | JevScoreQuestion;

export interface JevNoulAnswer {
  type: "noul";
  noul: number;
}

export interface JevScoreAnswer {
  type: "score";
  score: number;
  confidence: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
}

export type JevAnswer = JevNoulAnswer | JevScoreAnswer;

export interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { input_tokens: number; output_tokens: number };
}

export interface AskJevOptions {
  /** Defaults to `jev-latest` */
  model?: string;
  /** Defaults to the TYPESAFE_KEY environment variable */
  apiKey?: string;
  /** Wait before retrying a 429/5xx, doubled per retry. Default 1000. */
  retryDelayMs?: number;
}

/** A non-2xx reply from the Jev API. */
export class JevError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(`Jev API error ${status}: ${detail}`);
    this.name = "JevError";
    this.status = status;
  }
}

/**
 * Ask Jev a set of questions about some state.
 *
 * @param state - What the questions are about (string, object or array)
 * @param questions - Questions by id
 * @param options - Model, key and retry settings
 * @returns Jev's answers by question id, plus token usage
 */
export async function askJev(
  state: unknown,
  questions: Record<string, JevQuestion>,
  options: AskJevOptions = {},
): Promise<JevResponse> {
  const apiKey = options.apiKey ?? process.env.TYPESAFE_KEY;

  if (apiKey == null || apiKey === "") {
    throw new Error("TYPESAFE_KEY is not set (add it to .env)");
  }

  const body = JSON.stringify({
    model: options.model ?? DEFAULT_MODEL,
    state,
    questions,
  });

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(JEV_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body,
    });

    if (response.ok) {
      return (await response.json()) as JevResponse;
    }

    const retryable = response.status === 429 || response.status >= 500;

    if (!retryable || attempt >= MAX_RETRIES) {
      throw new JevError(response.status, await readDetail(response));
    }

    await sleep((options.retryDelayMs ?? 1000) * 2 ** attempt);
  }
}

/**
 * Pull the error text out of a failed response. Jev sends `{detail}` as a
 * string (400) or a list of problems (422).
 *
 * @param response - The non-2xx response
 * @returns A readable error message
 */
async function readDetail(response: Response): Promise<string> {
  const text = await response.text();

  try {
    const { detail } = JSON.parse(text) as { detail?: unknown };

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
  } catch {
    // not JSON; fall through to the raw text
  }

  return text.slice(0, 500);
}
