// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
 * surface, or null. Covers `failed` responses and the `incomplete` reasons
 * worth flagging (max length, content filter); a benign one returns null.
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

    if (reason == null) {
      return null;
    }

    const message = INCOMPLETE_MESSAGES[reason];

    return message == null ? null : { code: reason, message };
  }

  return null;
}

// How many seconds each rate-limit unit normalizes to. OpenAI reports the wait
// as "166ms", "3.057s", or (rarely) "2m"; all three flow through the same
// countdown/auto-retry path once normalized to seconds.
const RETRY_UNIT_SECONDS: Record<string, number> = { ms: 0.001, s: 1, m: 60 };

// Fallback wait when a rate_limit_exceeded message carries no parseable time, so
// the retry UI still renders and auto-retry still arms instead of leaving a dead
// error banner with no path forward.
export const DEFAULT_RATE_LIMIT_BACKOFF_SECONDS = 2;

/**
 * Parse the wait from an OpenAI rate-limit message ("try again in 15.796s" /
 * "166ms" / "2m") and normalize to seconds. Units are ordered ms|m|s so "ms"
 * wins over a bare "s"/"m", and \b keeps one from matching inside "seconds".
 * @param message - The rate-limit error message
 * @returns Seconds to wait, or null if not parseable
 */
export function parseRetrySeconds(message: string): number | null {
  const match = /try again in ([\d.]+)\s*(ms|m|s)\b/i.exec(message);

  if (!match?.[1]) {
    return null;
  }

  const value = Number.parseFloat(match[1]);

  if (!Number.isFinite(value)) {
    return null;
  }

  const multiplier = RETRY_UNIT_SECONDS[match[2]?.toLowerCase() ?? "s"] ?? 1;

  return value * multiplier;
}

/**
 * Extract a human-readable message from an unknown error value: Error, string,
 * or the common `{ message }` / `{ error: { message } }` shapes. Falls back to
 * `JSON.stringify` so an opaque object isn't shown as "[object Object]".
 * @param value - The error value
 * @returns A non-empty string suitable for display
 */
export function extractErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;

    if (typeof obj.message === "string" && obj.message) {
      return obj.message;
    }

    if (obj.error && typeof obj.error === "object") {
      const nested = (obj.error as Record<string, unknown>).message;

      if (typeof nested === "string" && nested) {
        return nested;
      }
    }

    try {
      return JSON.stringify(value);
    } catch {
      // Circular or otherwise unserializable — String() would only say
      // "[object Object]".
      return "[unserializable error]";
    }
  }

  return String(value);
}
