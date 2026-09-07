// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Arguments no param accepts get stripped before the handler runs, on both
// transports. Saying so is the only way a caller finds out: a typo'd optional
// param otherwise comes back as a clean success that changed nothing.
//
// MCP and REST diff against different schemas on purpose — see the callers.

import { type ZodType } from "zod";
import { WARNING_PREFIX } from "#src/shared/mcp-response-utils.ts";

/**
 * Names the arguments a caller sent that the schema does not accept.
 * @param args - The raw arguments, before Zod strips anything
 * @param expected - The schema to diff against
 * @returns The unexpected keys, in the order they were sent
 */
export function unexpectedArgKeys(
  args: unknown,
  expected: Record<string, ZodType>,
): string[] {
  // Takes unknown because a transport can hand over whatever was posted, and
  // Object.keys on an array or a string reports indexes as param names.
  if (args == null || typeof args !== "object" || Array.isArray(args)) {
    return [];
  }

  const expectedKeys = new Set(Object.keys(expected));

  return Object.keys(args).filter((key) => !expectedKeys.has(key));
}

/**
 * Builds the warning naming arguments that were ignored.
 * @param keys - The unexpected keys, from {@link unexpectedArgKeys}
 * @returns The warning text, or undefined when nothing was unexpected
 */
export function unexpectedArgsWarning(keys: string[]): string | undefined {
  if (keys.length === 0) return undefined;

  return `${WARNING_PREFIX}ignored unexpected argument(s): ${keys.join(", ")}`;
}
