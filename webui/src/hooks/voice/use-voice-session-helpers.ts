// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type RealtimeItem,
  type RealtimeMessageItem,
} from "@openai/agents/realtime";
import { OPENAI_REALTIME_MODEL } from "#webui/lib/constants/models";

/**
 * Fetch an ephemeral `ek_...` token from the backend proxy.
 *
 * @param voiceTokenUrl - URL of the /voice-token endpoint
 * @param openAiKey - User's OpenAI API key (sent in X-OpenAI-Key header)
 * @returns The ephemeral client secret value
 */
export async function fetchEphemeralToken(
  voiceTokenUrl: string,
  openAiKey: string,
): Promise<string> {
  const response = await fetch(voiceTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OpenAI-Key": openAiKey,
    },
    body: JSON.stringify({ model: OPENAI_REALTIME_MODEL }),
  });

  if (!response.ok) {
    const detail = await safeJson(response);

    throw new Error(
      `Voice token request failed: ${response.status} ${response.statusText}${
        detail ? ` — ${JSON.stringify(detail)}` : ""
      }`,
    );
  }

  const json = (await response.json()) as { value?: string };

  if (!json.value) {
    throw new Error("Voice token response missing 'value' field");
  }

  return json.value;
}

export interface ResponseFailure {
  code: string;
  message: string;
}

// User-facing messages for the `incomplete` reasons worth surfacing. Reasons
// not listed here (e.g. turn_detected / client_cancelled — a normal barge-in or
// interruption) are intentionally ignored so they don't flash an error banner.
const INCOMPLETE_MESSAGES: Record<string, string> = {
  max_output_tokens: "Response cut off — it reached the maximum length.",
  content_filter: "Response stopped by the content filter.",
};

/**
 * Inspect a transport `response.done` event and return a structured failure to
 * surface, or null. Covers `failed` responses (server error) and the
 * `incomplete` reasons worth flagging (max length, content filter); a benign
 * incomplete reason such as an interruption returns null.
 *
 * @param event - The transport event payload
 * @returns Failure code + message, or null
 */
export function extractResponseFailure(event: unknown): ResponseFailure | null {
  const e = event as {
    response?: {
      status?: string;
      status_details?: {
        error?: { code?: string; message?: string };
        reason?: string;
      };
    };
  };

  const response = e.response;

  if (response?.status === "failed") {
    const err = response.status_details?.error;

    return {
      code: err?.code ?? "unknown",
      message: err?.message ?? err?.code ?? "Response failed",
    };
  }

  if (response?.status === "incomplete") {
    const reason = response.status_details?.reason;

    if (reason == null) return null;
    const message = INCOMPLETE_MESSAGES[reason];

    return message == null ? null : { code: reason, message };
  }

  return null;
}

/**
 * Parse "...Please try again in 15.796s..." from an OpenAI rate-limit message.
 *
 * @param message - The rate-limit error message
 * @returns Seconds to wait, or null if not parseable
 */
export function parseRetrySeconds(message: string): number | null {
  const match = /try again in ([\d.]+)s/i.exec(message);

  if (!match?.[1]) return null;
  const seconds = Number.parseFloat(match[1]);

  return Number.isFinite(seconds) ? seconds : null;
}

/**
 * Best-effort JSON read; returns null on failure.
 *
 * @param response - Fetch response
 * @returns Parsed JSON or null
 */
async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Convert a saved voice history into items the Realtime server will accept via
 * `conversation.item.create`. Drops non-message items (function/MCP calls are
 * not re-seedable) and rewrites audio content to text content carrying the
 * saved transcript. Items left with no usable content are dropped.
 *
 * @param history - Saved voice history items
 * @returns Text-only message items in original order
 */
export function toSeedableHistory(
  history: RealtimeItem[],
): RealtimeMessageItem[] {
  const out: RealtimeMessageItem[] = [];

  for (const item of history) {
    if (item.type !== "message") continue;
    const seeded = messageToTextOnly(item);

    if (seeded) out.push(seeded);
  }

  return out;
}

/**
 * Rewrite a single message item so its content is text-only. Returns null when
 * nothing useful remains (e.g. an audio item whose transcript is still null).
 *
 * @param item - The message item to rewrite
 * @returns The text-only message, or null if empty after filtering
 */
function messageToTextOnly(
  item: RealtimeMessageItem,
): RealtimeMessageItem | null {
  if (item.role === "system") return item;

  if (item.role === "user") {
    const content = item.content.flatMap((c) => {
      if (c.type === "input_text") return [c];

      if (c.transcript) {
        return [{ type: "input_text" as const, text: c.transcript }];
      }

      return [];
    });

    if (content.length === 0) return null;

    return { ...item, content };
  }

  const content = item.content.flatMap((c) => {
    if (c.type === "output_text") return [c];

    if (c.transcript) {
      return [{ type: "output_text" as const, text: c.transcript }];
    }

    return [];
  });

  if (content.length === 0) return null;

  return { ...item, content };
}

/**
 * Extract a human-readable message from an unknown error value. Handles Error
 * instances, plain strings, and the common `{ message: ... }` /
 * `{ error: { message: ... } }` server-error shapes. Falls back to
 * `JSON.stringify` so an opaque object doesn't surface as "[object Object]".
 *
 * @param value - The error value
 * @returns A non-empty string suitable for display
 */
export function extractErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;

    if (typeof obj.message === "string" && obj.message) return obj.message;

    if (obj.error && typeof obj.error === "object") {
      const nested = (obj.error as Record<string, unknown>).message;

      if (typeof nested === "string" && nested) return nested;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}
