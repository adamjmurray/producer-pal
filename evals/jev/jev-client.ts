// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Minimal client for TypeSafe AI's Jev model: ask typed questions about a
 * piece of state and get back probabilities.
 */

import { sleep } from "#evals/shared/sleep.ts";

/** Where Jev can be reached; all take the same request and answer alike. */
export const JEV_ROUTES = {
  typesafe: {
    url: "https://api.typesafe.ai/v1/systemone",
    envVar: "TYPESAFE_KEY",
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/systemone",
    envVar: "OPENROUTER_KEY",
  },
  vercel: {
    url: "https://ai-gateway.vercel.sh/typesafe/v1/systemone",
    envVar: "VERCEL_AI_GATEWAY_KEY",
  },
} as const;

export type JevRoute = keyof typeof JEV_ROUTES;

/** Route names in default-pick order. */
export const JEV_ROUTE_NAMES = Object.keys(JEV_ROUTES) as JevRoute[];

/**
 * Check a route name from a command-line flag.
 *
 * @param name - The flag value, if given
 * @param flag - The flag's name, for the error message
 * @returns The route, or undefined when no name was given
 * @throws On a name that is not a route
 */
export function parseJevRoute(
  name: string | undefined,
  flag = "--via",
): JevRoute | undefined {
  if (name != null && !JEV_ROUTE_NAMES.includes(name as JevRoute)) {
    throw new Error(
      `Unknown ${flag}=${name}; use one of ${JEV_ROUTE_NAMES.join(", ")}`,
    );
  }

  return name as JevRoute | undefined;
}

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
  usage: {
    input_tokens: number;
    output_tokens: number;
    /** Actual cost in USD; only OpenRouter reports it */
    cost?: number;
  };
}

export interface AskJevOptions {
  /** Defaults to `jev-latest` */
  model?: string;
  /** Defaults to the first route whose key is set (see `resolveJevRoute`) */
  route?: JevRoute;
  /** Defaults to the route's environment variable */
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
 * Pick the route and key to call Jev with.
 *
 * @param route - The route to use; default is the first with a key set
 * @param apiKey - Key override; with no route, it goes to TypeSafe
 * @returns The route name, its URL and the key
 */
export function resolveJevRoute(
  route?: JevRoute,
  apiKey?: string,
): { route: JevRoute; url: string; apiKey: string } {
  const keyFor = (name: JevRoute): string | undefined => {
    const key = process.env[JEV_ROUTES[name].envVar];

    return key == null || key === "" ? undefined : key;
  };

  const hasOverride = apiKey != null && apiKey !== "";
  const name =
    route ??
    JEV_ROUTE_NAMES.find((n) => keyFor(n) != null) ??
    (hasOverride ? "typesafe" : undefined);

  if (name == null) {
    const vars = JEV_ROUTE_NAMES.map((n) => JEV_ROUTES[n].envVar).join(", ");

    throw new Error(`No Jev API key set: set one of ${vars} (add it to .env)`);
  }

  const key = hasOverride ? apiKey : keyFor(name);

  if (key == null) {
    throw new Error(
      `${JEV_ROUTES[name].envVar} is not set (add it to .env), needed for --via=${name}`,
    );
  }

  return { route: name, url: JEV_ROUTES[name].url, apiKey: key };
}

/**
 * Ask Jev a set of questions about some state.
 *
 * @param state - What the questions are about (string, object or array)
 * @param questions - Questions by id
 * @param options - Route, model, key and retry settings
 * @returns Jev's answers by question id, plus token usage
 */
export async function askJev(
  state: unknown,
  questions: Record<string, JevQuestion>,
  options: AskJevOptions = {},
): Promise<JevResponse> {
  const { url, apiKey } = resolveJevRoute(options.route, options.apiKey);

  const body = JSON.stringify({
    model: options.model ?? DEFAULT_MODEL,
    state,
    questions,
  });

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
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
