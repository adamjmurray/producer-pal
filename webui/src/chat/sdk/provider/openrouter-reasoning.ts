// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const FETCH_TIMEOUT_MS = 3000;

/** `format` OpenRouter stamps on Claude's reasoning_details entries. */
export const CLAUDE_REASONING_FORMAT = "anthropic-claude-v1";

/** Model id -> whether reasoning is mandatory (can't be turned off). */
type ReasoningMandatory = Map<string, boolean>;

// One fetch per session, shared by concurrent callers. A failure clears it so
// a later send retries.
let pending: Promise<ReasoningMandatory | null> | null = null;

/** Minimal shape of the OpenRouter chat body fields this module touches. */
interface ReasoningBody {
  model?: string;
  reasoning?: { effort?: string };
  messages?: Array<{
    reasoning?: string;
    reasoning_details?: Array<{ format?: string }>;
  }>;
}

/**
 * Settle an "Off" reasoning request for an OpenRouter model. Off arrives as
 * `reasoning.effort: "none"`, which mandatory-reasoning models refuse (400).
 * Those get "low", the least they accept. A model missing from OpenRouter's
 * list, or a list that can't be fetched, loses the field (the old Off).
 * @param body - Parsed request body (mutated in place)
 * @returns True if the body changed
 */
export async function settleOpenRouterReasoningOff(
  body: ReasoningBody,
): Promise<boolean> {
  if (body.reasoning?.effort !== "none" || typeof body.model !== "string") {
    return false;
  }

  const models = await loadReasoningMandatory();
  const mandatory = models?.get(body.model);

  if (mandatory == null) {
    delete body.reasoning;

    return true;
  }

  if (mandatory) {
    body.reasoning.effort = "low";

    return true;
  }

  return false;
}

/**
 * Take Claude's signed reasoning back off earlier assistant messages when this
 * request can't use it: reasoning is off (the API rejects thinking blocks then)
 * or the model isn't Claude (a signature only means something to its own
 * model). Run after {@link settleOpenRouterReasoningOff}, so a model that can't
 * turn reasoning off keeps its blocks. Only Claude-format entries go; another
 * model's reasoning_details (Gemini signatures, say) are never touched.
 * @param body - Parsed request body (mutated in place)
 * @returns True if the body changed
 */
export function dropUnusableClaudeReasoning(body: ReasoningBody): boolean {
  const usable =
    body.reasoning != null &&
    body.reasoning.effort !== "none" &&
    typeof body.model === "string" &&
    body.model.startsWith("anthropic/");

  if (usable || !Array.isArray(body.messages)) {
    return false;
  }

  let changed = false;

  for (const message of body.messages) {
    const details = message.reasoning_details;

    if (!Array.isArray(details)) {
      continue;
    }

    const kept = details.filter((d) => d.format !== CLAUDE_REASONING_FORMAT);

    if (kept.length === details.length) {
      continue;
    }

    changed = true;

    if (kept.length > 0) {
      message.reasoning_details = kept;
    } else {
      delete message.reasoning_details;
      delete message.reasoning;
    }
  }

  return changed;
}

/**
 * Forget the cached model list. Tests only.
 */
export function resetOpenRouterReasoningCache(): void {
  pending = null;
}

/**
 * Get the model list, fetching it once and sharing that fetch.
 * @returns Mandatory flags by model id, or null when the fetch failed
 */
function loadReasoningMandatory(): Promise<ReasoningMandatory | null> {
  if (pending == null) {
    const request = fetchReasoningMandatory();

    pending = request;
    void request.then((result) => {
      if (result == null && pending === request) {
        pending = null;
      }
    });
  }

  return pending;
}

/**
 * Fetch OpenRouter's public model list. Never throws: a failure, timeout or
 * malformed response gives null.
 * @returns Mandatory flags by model id, or null
 */
async function fetchReasoningMandatory(): Promise<ReasoningMandatory | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, FETCH_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      requestReasoningMandatory(controller.signal),
      timeout,
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Request and parse the model list. Only models with a `reasoning.mandatory`
 * flag are kept; the rest are unknown to the caller.
 * @param signal - Aborts the request
 * @returns Mandatory flags by model id, or null on an HTTP error or bad shape
 */
async function requestReasoningMandatory(
  signal: AbortSignal,
): Promise<ReasoningMandatory | null> {
  const response = await fetch(MODELS_URL, { signal });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as {
    data?: Array<{ id?: unknown; reasoning?: { mandatory?: unknown } }>;
  };

  if (!Array.isArray(json.data)) {
    return null;
  }

  const result: ReasoningMandatory = new Map();

  for (const model of json.data) {
    if (
      typeof model.id === "string" &&
      typeof model.reasoning?.mandatory === "boolean"
    ) {
      result.set(model.id, model.reasoning.mandatory);
    }
  }

  return result;
}
