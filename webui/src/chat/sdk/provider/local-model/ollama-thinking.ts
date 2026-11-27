// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

const SHOW_TIMEOUT_MS = 3000;

/** What to do with the effort when the server can't say if the model thinks. */
export type UnknownThinking = "keep" | "drop";

// `root model` -> whether the model thinks; null when the server didn't say.
// A request that failed isn't kept, so it's asked again.
const thinks = new Map<string, Promise<boolean | null>>();

/**
 * Take `reasoning_effort` off a chat request to an Ollama model that can't
 * think. Ollama refuses any effort but "none" for such a model (400), and says
 * which models think in `/api/show`. Imports nothing, so evals can use it.
 * @param body - Parsed request body (mutated in place)
 * @param serverRoot - The server's root URL, without `/v1` (see `localServerRoot`)
 * @param unknown - "drop" when the server is known to be Ollama; "keep" when it
 *   may be another server, such as LM Studio, which accepts any effort
 * @returns True if the body changed
 */
export async function settleOllamaThinking(
  body: unknown,
  serverRoot: string,
  unknown: UnknownThinking,
): Promise<boolean> {
  const request = body as { model?: unknown; reasoning_effort?: unknown };
  const effort = request.reasoning_effort;

  if (effort == null || effort === "none") {
    return false;
  }

  const known =
    typeof request.model === "string"
      ? await ollamaModelThinks(serverRoot, request.model)
      : null;

  if (known === true || (known == null && unknown === "keep")) {
    return false;
  }

  delete request.reasoning_effort;

  return true;
}

/**
 * Forget which models think. Tests only.
 */
export function resetOllamaThinkingCache(): void {
  thinks.clear();
}

/**
 * Ask Ollama whether a model thinks, once per model.
 * @param serverRoot - The server's root URL
 * @param model - Model id
 * @returns True or false, or null when the server didn't say
 */
function ollamaModelThinks(
  serverRoot: string,
  model: string,
): Promise<boolean | null> {
  const key = `${serverRoot} ${model}`;
  let known = thinks.get(key);

  if (known == null) {
    known = requestOllamaModelThinks(serverRoot, model).catch(() => {
      thinks.delete(key);

      return null;
    });
    thinks.set(key, known);
  }

  return known;
}

/**
 * Read a model's `capabilities` from `/api/show`.
 * @param serverRoot - The server's root URL
 * @param model - Model id
 * @returns Whether "thinking" is listed, or null on a bad shape
 */
async function requestOllamaModelThinks(
  serverRoot: string,
  model: string,
): Promise<boolean | null> {
  const response = await fetch(`${serverRoot}/api/show`, {
    method: "POST",
    body: JSON.stringify({ model }),
    signal: AbortSignal.timeout(SHOW_TIMEOUT_MS),
  });

  // Thrown, not answered, so it's asked again: the model may be pulled later.
  if (!response.ok) {
    throw new Error(`/api/show answered ${response.status}`);
  }

  const json = (await response.json()) as { capabilities?: unknown };

  return Array.isArray(json.capabilities)
    ? json.capabilities.includes("thinking")
    : null;
}
