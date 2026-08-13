// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Normalizes an error into a string message with "Error:" prefix
 * @param {unknown} error - Error object or message
 * @returns {string} Normalized error string with "Error:" prefix
 */
export function normalizeErrorMessage(error: unknown): string {
  console.error(error);
  const message = describeError(error);

  return message.startsWith("Error") ? message : `Error: ${message}`;
}

/**
 * Extracts the most readable description available from an error value.
 * @param {unknown} error - Error object, JSON error payload, or primitive
 * @returns {string} Description, without the "Error:" prefix
 */
function describeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;

  if (error != null && typeof error === "object") {
    return describeErrorPayload(error as Record<string, unknown>);
  }

  return String(error);
}

/**
 * Describes a JSON error payload, such as the OpenRouter/OpenAI shape
 * `{ code: 429, message: "...", metadata: { error_type: "..." } }`.
 * @param {Record<string, unknown>} payload - The error payload
 * @returns {string} Description, falling back to JSON when no message is found
 */
function describeErrorPayload(payload: Record<string, unknown>): string {
  const nested = payload.error;

  if (nested != null && typeof nested === "object") {
    return describeErrorPayload(nested as Record<string, unknown>);
  }

  const message = [payload.message, nested, payload.detail].find(
    (value): value is string => typeof value === "string" && value !== "",
  );

  if (message == null) return stringifyPayload(payload);

  const details = [payload.code, errorTypeOf(payload)].filter(
    (value) => value != null && value !== "",
  );

  return details.length > 0 ? `${message} (${details.join(": ")})` : message;
}

/**
 * Reads a provider's error-type label out of an error payload.
 * @param {Record<string, unknown>} payload - The error payload
 * @returns {string | null} The error type, or null when absent
 */
function errorTypeOf(payload: Record<string, unknown>): string | null {
  const metadata = payload.metadata;
  const type =
    metadata != null && typeof metadata === "object"
      ? (metadata as Record<string, unknown>).error_type
      : payload.type;

  return typeof type === "string" ? type : null;
}

/**
 * Renders an error payload as JSON, for payloads carrying no message field.
 * @param {Record<string, unknown>} payload - The error payload
 * @returns {string} JSON text, or a placeholder if it isn't serializable
 */
function stringifyPayload(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload);
  } catch {
    // Circular or otherwise unserializable. String() would only say
    // "[object Object]", which tells the reader less than this does.
    return "[unserializable error payload]";
  }
}
