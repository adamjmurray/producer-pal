// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Extract error message from an unknown caught error.
 * In strict mode, caught errors are typed as `unknown`.
 * @param err - The caught error
 * @returns The error message
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Find the message in a provider's JSON error payload. Providers wrap it
 * (`{ error: { message } }` from OpenAI, OpenRouter and Anthropic), and the
 * wrapper's own `message` is at best generic, so the nested one wins. Then
 * `message`, a string `error`, and `detail`.
 * @param payload - The payload, or anything else (which has no message)
 * @returns The first non-empty message, or undefined when there is none
 */
export function errorPayloadMessage(payload: unknown): string | undefined {
  if (payload == null || typeof payload !== "object") {
    return undefined;
  }

  const { error, message, detail } = payload as Record<string, unknown>;

  return [errorPayloadMessage(error), message, error, detail].find(
    (value): value is string => typeof value === "string" && value !== "",
  );
}

/**
 * Asserts a value is defined, throwing if null/undefined. Used for type narrowing.
 * @param value - Value to check
 * @param msg - Error message if undefined
 * @returns The value, narrowed to exclude null/undefined
 */
export function assertDefined<T>(value: T, msg: string): NonNullable<T> {
  if (value == null) {
    throw new Error(`Bug: ${msg}`);
  }

  return value;
}
