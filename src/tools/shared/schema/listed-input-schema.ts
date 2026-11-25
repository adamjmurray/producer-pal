// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Node-side only (MCP server and portal): importing this from V8 code would
// pull the MCP SDK into the device's V8 bundle.
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { type z } from "zod";

/**
 * A tool's params as `tools/list` publishes them, for listing a tool without
 * going through the server. Uses the SDK's own converter and options, so a
 * param with a default stays optional, then the same trim as the listing.
 *
 * @param schema - The registered params object
 * @returns The JSON Schema `tools/list` would publish
 */
export function listedInputSchema(
  schema: z.ZodObject,
): Record<string, unknown> {
  const listed = toJsonSchemaCompat(schema, {
    strictUnions: true,
    pipeStrategy: "input",
  });

  trimListedInputSchema(listed);

  return listed;
}

/**
 * Drop two things from a listed `inputSchema`, as Anthropic and OpenAI bill for
 * them and they say nothing:
 *
 * - `$schema`, which the SDK stamps on each tool with no switch to stop it.
 *   Clients then read the schemas as JSON Schema 2020-12, and every keyword we
 *   emit means the same there.
 * - the top-level `additionalProperties: {}` that `.loose()` adds. Absent means
 *   the same, and nested objects already omit it. Only the listing changes:
 *   validation still uses the loose zod schema, so unknown args keep reaching
 *   the handler.
 *
 * @param schema - A listed `inputSchema`, changed in place
 */
export function trimListedInputSchema(
  schema: Record<string, unknown> | undefined,
): void {
  delete schema?.$schema;

  if (isEmptyObject(schema?.additionalProperties)) {
    delete schema?.additionalProperties;
  }
}

/**
 * @param value - Any value
 * @returns True for a plain `{}`
 */
function isEmptyObject(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value != null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}
