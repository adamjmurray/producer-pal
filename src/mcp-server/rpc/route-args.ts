// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared field extractors for Node-side RPC route handlers. Route args arrive as
 * an untyped JSON blob (see node-request-protocol.ts); these pull typed string
 * fields out and throw clean messages so the RPC error path renders them for the
 * LLM.
 */

/**
 * Extract a required string field from route args, throwing a clean message so
 * the RPC error path renders it for the LLM.
 *
 * @param args - The raw route args
 * @param key - The field name
 * @returns The string value
 */
export function requireString(args: unknown, key: string): string {
  const value = (args as Record<string, unknown> | null)?.[key];

  if (typeof value !== "string") throw new Error(`${key} must be a string`);

  return value;
}

/**
 * Extract an optional string field from route args, defaulting to "".
 *
 * @param args - The raw route args
 * @param key - The field name
 * @returns The string value, or "" when absent
 */
export function optionalString(args: unknown, key: string): string {
  const value = (args as Record<string, unknown> | null)?.[key];

  return typeof value === "string" ? value : "";
}
