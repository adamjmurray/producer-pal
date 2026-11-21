// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Context-size copies of Ollama models.
 *
 * Ollama's OpenAI-compatible `/v1` endpoint ignores any context setting in the
 * request. The only way to get a context size through it is a model copy with
 * `PARAMETER num_ctx` set, so `--context` creates one and runs against it.
 */

import { errorMessage } from "#src/shared/error-message.ts";

const QUICK_TIMEOUT_MS = 10_000;
const CREATE_TIMEOUT_MS = 60_000;

interface OllamaReply {
  ok: boolean;
  /** Parsed body, or undefined when it wasn't JSON */
  json?: Record<string, unknown>;
  text: string;
}

/**
 * Make sure a copy of an Ollama model with the given context size exists.
 * Creating it again is harmless: copies share the model's files.
 *
 * @param modelId - Base model id; a bare id means `:latest`
 * @param numCtx - Context size in tokens
 * @param baseUrl - Local server base URL (ends in `/v1`); only its origin is used
 * @returns The copy's model id, ready to use through `/v1`
 * @throws Error when the server isn't Ollama, the model is missing, the size
 *   exceeds the model's maximum, or the copy can't be created
 */
export async function ensureOllamaContextModel(
  modelId: string,
  numCtx: number,
  baseUrl: string,
): Promise<string> {
  const origin = new URL(baseUrl).origin;

  const version = await ollamaRequest(origin, "/api/version");

  if (!version.ok || typeof version.json?.version !== "string") {
    throw new Error(
      `--context only works with Ollama, and ${origin} isn't one (no /api/version).`,
    );
  }

  const show = await ollamaRequest(origin, "/api/show", { model: modelId });

  if (!show.ok) {
    throw new Error(
      `Model "${modelId}" not found on Ollama at ${origin}: ${serverError(show)}`,
    );
  }

  const max = maxContext(show.json);

  if (max != null && numCtx > max) {
    throw new Error(
      `--context ${numCtx} is more than "${modelId}" supports (${max}).`,
    );
  }

  const copy = contextModelName(modelId, numCtx);
  const create = await ollamaRequest(
    origin,
    "/api/create",
    {
      model: copy,
      from: modelId,
      parameters: { num_ctx: numCtx },
      stream: false,
    },
    CREATE_TIMEOUT_MS,
  );

  if (!create.ok || create.json?.status !== "success") {
    throw new Error(
      `Couldn't create "${copy}" from "${modelId}": ${serverError(create)}`,
    );
  }

  return copy;
}

/**
 * Name the copy: `-ctx<N>` goes on the name, before any tag, so the tag stays
 * last. `lfm2.5` becomes `lfm2.5-ctx65536`; `muse-glimmer:30b-mlx` becomes
 * `muse-glimmer-ctx65536:30b-mlx`. A `:` before a `/` is a registry port, not a tag.
 *
 * @param modelId - Base model id
 * @param numCtx - Context size in tokens
 * @returns The copy's model id
 */
export function contextModelName(modelId: string, numCtx: number): string {
  const colon = modelId.lastIndexOf(":");
  const hasTag = colon !== -1 && !modelId.slice(colon).includes("/");
  const name = hasTag ? modelId.slice(0, colon) : modelId;
  const tag = hasTag ? modelId.slice(colon) : "";

  return `${name}-ctx${numCtx}${tag}`;
}

/**
 * @param show - Parsed `/api/show` body
 * @returns The model's maximum context length, if the server reports one
 */
function maxContext(
  show: Record<string, unknown> | undefined,
): number | undefined {
  const info = show?.model_info;

  if (info == null || typeof info !== "object") {
    return undefined;
  }

  const entry = Object.entries(info).find(([key]) =>
    key.endsWith(".context_length"),
  );

  return typeof entry?.[1] === "number" ? entry[1] : undefined;
}

/**
 * @param reply - A failed reply
 * @returns The server's error text, or the raw body
 */
function serverError(reply: OllamaReply): string {
  const error = reply.json?.error;

  return typeof error === "string" ? error : reply.text.trim() || "no details";
}

/**
 * Call an Ollama endpoint. Not `fetchLocalServerJson`: that swallows errors and
 * times out at 3s, and here we need the error details and a longer create wait.
 * Server errors come back in the reply; a server that
 * can't be reached or doesn't answer in time throws.
 *
 * @param origin - Server origin
 * @param path - Endpoint path, e.g. "/api/show"
 * @param body - JSON body to POST; omit for a GET
 * @param timeoutMs - How long to wait for the reply
 * @returns The reply
 * @throws Error when the server is unreachable or times out
 */
async function ollamaRequest(
  origin: string,
  path: string,
  body?: unknown,
  timeoutMs = QUICK_TIMEOUT_MS,
): Promise<OllamaReply> {
  let response: Response;

  try {
    response = await fetch(new URL(path, origin), {
      signal: AbortSignal.timeout(timeoutMs),
      ...(body !== undefined && {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";

    throw new Error(
      timedOut
        ? `Ollama at ${origin} didn't answer ${path} within ${timeoutMs / 1000}s.`
        : `Can't reach Ollama at ${origin}: ${errorMessage(error)}${causeCode(error)}`,
      { cause: error },
    );
  }

  const text = await response.text();

  return { ok: response.ok, json: parseObject(text), text };
}

/**
 * @param error - A fetch failure
 * @returns The underlying cause code (e.g. " (ECONNREFUSED)"), or ""
 */
function causeCode(error: unknown): string {
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;

  return typeof code === "string" ? ` (${code})` : "";
}

/**
 * @param text - Response body
 * @returns The body as an object, or undefined when it isn't a JSON object
 */
function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);

    return parsed != null && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
