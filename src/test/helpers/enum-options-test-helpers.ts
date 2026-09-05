// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Reading the enum values a tool actually publishes, so a test never hand-copies
 * a `.def.ts` list into a literal that can drift from it.
 */
import { type z, type ZodType } from "zod";
import { type Notation } from "#src/shared/notation.ts";
import { type ToolDefFunction } from "#src/tools/shared/tool-framework/define-tool.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";

/** Large-model mode in the default notation. */
const LARGE_MODEL = { notation: "barbeat" as Notation, smallModelMode: false };

/**
 * A param's enum options, unwrapped from the builders params are declared with.
 * @param schema - A published param schema
 * @returns Its enum options, or [] when it isn't enum-shaped
 */
export function liveEnumValues(schema: ZodType): readonly string[] {
  type Unwrappable = { type: string; def: Record<string, unknown> };

  let current = schema as unknown as Unwrappable;

  // Unwrap the builders enum params are actually declared with:
  // z.array(z.enum(…)).default(…), z.enum(…).optional().default(…), etc.
  while (["default", "optional", "nullable", "array"].includes(current.type)) {
    const inner = (current.def.innerType ?? current.def.element) as
      | Unwrappable
      | undefined;

    if (inner == null) return [];

    current = inner;
  }

  return current.type === "enum"
    ? ((current as unknown as z.ZodEnum).options as string[])
    : [];
}

/**
 * The values a tool publishes for one enum param.
 * @param def - The tool definition
 * @param paramName - The param to read
 * @param context - Notation and small-model axes (defaults to large model)
 * @returns The published enum values, or [] when the param isn't published
 */
export function publishedEnumValues(
  def: ToolDefFunction,
  paramName: string,
  context = LARGE_MODEL,
): string[] {
  const { published } = resolveToolSchema(def.toolOptions.inputSchema, context);
  const schema = published[paramName];

  return schema == null ? [] : [...liveEnumValues(schema)];
}
