// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Rate limit detection and retry utilities for API error handling.
 *
 * Provides functions to detect rate limit errors from various API providers
 * and calculate appropriate retry delays using exponential backoff.
 */

/**
 * Rate limit error information extracted from an API error
 */
export interface RateLimitInfo {
  isRateLimited: boolean;
  retryAfterMs: number | null;
  message: string;
}

/**
 * Default retry delays for exponential backoff (in milliseconds)
 */
export const DEFAULT_RETRY_DELAYS = [5000, 10000, 20000, 40000, 60000] as const;

/**
 * Maximum number of retry attempts
 */
export const MAX_RETRY_ATTEMPTS = 5;

/** "rate limit", "rate-limit", "rate_limit"; not "context limit" or "migrate limit". */
const RATE_LIMIT_WORDS = /\brate[ _-]?limit/i;

/**
 * Patterns that indicate a rate limit error in error messages
 */
const RATE_LIMIT_PATTERNS = [
  /resource.*exhausted/i,
  RATE_LIMIT_WORDS,
  /quota.*exceeded/i,
  /exceeded.*quota/i,
  /too.*many.*requests/i,
] as const;

/**
 * OpenAI's out-of-credit 429 carries `insufficient_quota` in its body; waiting
 * won't fix it. Match that code, not the message: Gemini's retryable
 * per-minute 429 says the same "You exceeded your current quota".
 */
const PERMANENT_QUOTA_CODE = "insufficient_quota";

/**
 * Checks for a permanent out-of-credit error (see PERMANENT_QUOTA_CODE). The
 * AI SDK's `responseBody` holds the raw HTTP body or stream error frame, so
 * every OpenAI error shape is covered by one text search.
 * @param {unknown} error - Error object to analyze
 * @returns {boolean} Whether retrying cannot help
 */
function isPermanentQuotaError(error: unknown): boolean {
  if (typeof error === "string") {
    return error.includes(PERMANENT_QUOTA_CODE);
  }

  if (typeof error !== "object" || error == null) {
    return false;
  }

  const { responseBody } = error as { responseBody?: unknown };

  // Message for Errors, the whole body for plain error objects
  const text = error instanceof Error ? error.message : safeStringify(error);

  return [text, responseBody].some(
    (part) => typeof part === "string" && part.includes(PERMANENT_QUOTA_CODE),
  );
}

/**
 * JSON.stringify that returns "" instead of throwing (e.g. circular objects)
 * @param {object} value - Value to serialize
 * @returns {string} JSON text, or "" on failure
 */
function safeStringify(value: object): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/**
 * Detects if an error is a rate limit error and extracts relevant info
 * @param {unknown} error - Error object to analyze
 * @returns {RateLimitInfo} Rate limit information
 */
export function detectRateLimit(error: unknown): RateLimitInfo {
  const errorString = extractErrorString(error);
  const statusCode = extractStatusCode(error);

  const isRateLimited =
    !isPermanentQuotaError(error) &&
    (statusCode === 429 ||
      RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(errorString)));

  return {
    isRateLimited,
    retryAfterMs: isRateLimited ? extractRetryAfter(error) : null,
    message: isRateLimited ? formatRateLimitMessage(errorString) : errorString,
  };
}

/**
 * Calculates the delay for a retry attempt using exponential backoff
 * @param {number} attempt - Current retry attempt (0-indexed)
 * @param {number | null} retryAfterMs - Optional server-suggested retry delay
 * @returns {number} Delay in milliseconds
 */
export function calculateRetryDelay(
  attempt: number,
  retryAfterMs: number | null = null,
): number {
  // If server provided a retry-after value, use it (with a cap)
  if (retryAfterMs != null && retryAfterMs > 0) {
    return Math.min(retryAfterMs, 60000);
  }

  // Use exponential backoff with jitter
  const baseDelay = DEFAULT_RETRY_DELAYS[attempt] ?? 60000;
  const jitter = Math.random() * 1000;

  return baseDelay + jitter;
}

/**
 * Checks if we should retry based on attempt count
 * @param {number} attempt - Current retry attempt (0-indexed)
 * @returns {boolean} Whether another retry should be attempted
 */
export function shouldRetry(attempt: number): boolean {
  return attempt < MAX_RETRY_ATTEMPTS;
}

/**
 * Extracts the error message as a string
 * @param {unknown} error - Error object to extract message from
 * @returns {string} Error message string
 */
function extractErrorString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error != null) {
    const errorObj = error as Record<string, unknown>;

    // Handle nested error object structure (common in API responses)
    if (typeof errorObj.error === "object" && errorObj.error != null) {
      const nestedError = errorObj.error as Record<string, unknown>;

      if (typeof nestedError.message === "string") {
        return nestedError.message;
      }
    }

    if (typeof errorObj.message === "string") {
      return errorObj.message;
    }
  }

  return String(error);
}

/**
 * Extracts HTTP status code from error object
 * @param {unknown} error - Error object to extract status code from
 * @returns {number | null} HTTP status code or null if not found
 */
function extractStatusCode(error: unknown): number | null {
  if (typeof error !== "object" || error == null) {
    return null;
  }

  const errorObj = error as Record<string, unknown>;

  // Direct status property
  if (typeof errorObj.status === "number") {
    return errorObj.status;
  }

  // AI SDK APICallError uses statusCode (not status)
  if (typeof errorObj.statusCode === "number") {
    return errorObj.statusCode;
  }

  // Nested in error object
  if (typeof errorObj.error === "object" && errorObj.error != null) {
    const nestedError = errorObj.error as Record<string, unknown>;

    if (typeof nestedError.code === "number") {
      return nestedError.code;
    }
  }

  // Last resort: a status written as "(429)", "HTTP/1.1 429", "status=429" or
  // `"code":429`. A bare number elsewhere (token counts, line numbers) is not.
  const message = extractErrorString(error);
  const statusMatch =
    /(?:^|[("]|\b(?:status_?code|status|code|error|http(?:\/[\d.]+)?)["']?\s*[:=]?\s*)(429|503)\b/i.exec(
      message,
    );

  if (statusMatch?.[1]) {
    return Number.parseInt(statusMatch[1]);
  }

  return null;
}

/**
 * Extracts retry-after value from error response (in milliseconds).
 * Handles two distinct sources with different units:
 * - `errorObj.retryAfter`: SDK property exposed by AI SDK / Anthropic SDK,
 *   already converted to milliseconds
 * - `errorObj.headers["retry-after"]` / `errorObj.responseHeaders[...]`: raw
 *   HTTP Retry-After header, in seconds per RFC 7231 (we don't handle the
 *   HTTP-date form). The AI SDK's APICallError uses the `responseHeaders`
 *   spelling.
 * @param {unknown} error - Error object to extract retry-after from
 * @returns {number | null} Retry delay in milliseconds or null if not found
 */
function extractRetryAfter(error: unknown): number | null {
  if (typeof error !== "object" || error == null) {
    return null;
  }

  const errorObj = error as Record<string, unknown>;

  // SDK property: already in milliseconds, used as-is regardless of magnitude
  if (typeof errorObj.retryAfter === "number") {
    return errorObj.retryAfter;
  }

  // HTTP Retry-After header: per RFC 7231 the numeric form is in seconds
  const headers = (errorObj.headers ?? errorObj.responseHeaders) as
    | Record<string, unknown>
    | undefined;
  const headerValue = headers?.["retry-after"];

  if (typeof headerValue === "number") {
    return headerValue * 1000;
  }

  if (typeof headerValue === "string") {
    const seconds = Number.parseInt(headerValue, 10);

    if (!Number.isNaN(seconds)) {
      return seconds * 1000;
    }
  }

  return null;
}

/**
 * Formats a user-friendly rate limit message
 * @param {string} errorString - Original error message
 * @returns {string} User-friendly rate limit message
 */
function formatRateLimitMessage(errorString: string): string {
  // Keep the original message but make it more user-friendly
  if (/quota/i.test(errorString)) {
    return "API quota exceeded. The request will be retried automatically.";
  }

  if (RATE_LIMIT_WORDS.test(errorString)) {
    return "Rate limit reached. The request will be retried automatically.";
  }

  return "Too many requests. The request will be retried automatically.";
}
