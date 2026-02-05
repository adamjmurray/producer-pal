// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

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
export const DEFAULT_RETRY_DELAYS = [2000, 4000, 8000, 16000, 32000] as const;

/**
 * Maximum number of retry attempts
 */
export const MAX_RETRY_ATTEMPTS = 5;

/**
 * Patterns that indicate a rate limit error in error messages
 */
const RATE_LIMIT_PATTERNS = [
  /resource.*exhausted/i,
  /rate.*limit/i,
  /quota.*exceeded/i,
  /exceeded.*quota/i,
  /too.*many.*requests/i,
  /429/,
] as const;

/**
 * Detects if an error is a rate limit error and extracts relevant info
 * @param {unknown} error - Error object to analyze
 * @returns {RateLimitInfo} Rate limit information
 */
export function detectRateLimit(error: unknown): RateLimitInfo {
  const errorString = extractErrorString(error);
  const statusCode = extractStatusCode(error);

  const isRateLimited =
    statusCode === 429 ||
    RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(errorString));

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
  const baseDelay = DEFAULT_RETRY_DELAYS[attempt] ?? 32000;
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

  // Nested in error object
  if (typeof errorObj.error === "object" && errorObj.error != null) {
    const nestedError = errorObj.error as Record<string, unknown>;

    if (typeof nestedError.code === "number") {
      return nestedError.code;
    }
  }

  // Check error message for status code
  const message = extractErrorString(error);
  const statusMatch = /\b(429|503)\b/.exec(message);

  if (statusMatch?.[1]) {
    return Number.parseInt(statusMatch[1]);
  }

  return null;
}

/**
 * Extracts retry-after value from error response (in milliseconds)
 * @param {unknown} error - Error object to extract retry-after from
 * @returns {number | null} Retry delay in milliseconds or null if not found
 */
function extractRetryAfter(error: unknown): number | null {
  if (typeof error !== "object" || error == null) {
    return null;
  }

  const errorObj = error as Record<string, unknown>;

  // Check for retryAfter in various locations
  const retryAfter =
    errorObj.retryAfter ??
    (errorObj.headers as Record<string, unknown> | undefined)?.["retry-after"];

  if (typeof retryAfter === "number") {
    // Assume seconds if < 1000, otherwise assume milliseconds
    return retryAfter < 1000 ? retryAfter * 1000 : retryAfter;
  }

  if (typeof retryAfter === "string") {
    const seconds = Number.parseInt(retryAfter);

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

  if (/rate.*limit/i.test(errorString)) {
    return "Rate limit reached. The request will be retried automatically.";
  }

  return "Too many requests. The request will be retried automatically.";
}
