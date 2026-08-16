// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Retiring a param without breaking callers that still send it.
//
// Dropping it from a tool's inputSchema is not enough: define-tool derives its
// expected keys from that schema, so the param would be stripped before the
// handler ran and the caller would be told it was ignored — a silently dropped
// destination, which is the exact failure this codebase already paid for once.
//
// A deprecated param stays in the schema that validates, and is left out of the
// schema that gets published. Old callers keep working; the model never learns
// the old name.

import { type ZodType } from "zod";
import {
  describeWithTags,
  getSchemaTag,
  tagSchema,
} from "#src/tools/shared/tool-framework/schema-tags.ts";

export interface DeprecatedParamInfo {
  /** Param name to use instead, named in the warning. */
  replacedBy: string;
}

// Tags the schema instance without changing its type, so every other consumer
// still sees an ordinary ZodType. See schema-tags.ts.
const DEPRECATED_TAG = Symbol("deprecatedParam");

/**
 * Marks a param as deprecated: still accepted and validated, no longer
 * published to the model. Composes with {@link param} in either order.
 * @param schema - The param's Zod schema
 * @param info - What to use instead
 * @returns The schema, tagged as deprecated
 */
export function deprecatedParam<T extends ZodType>(
  schema: T,
  info: DeprecatedParamInfo,
): T {
  return tagSchema(
    describeWithTags(schema, `deprecated: use ${info.replacedBy}`),
    DEPRECATED_TAG,
    info,
  );
}

/**
 * Reads the deprecation attached to a schema by {@link deprecatedParam}.
 * @param schema - A param schema
 * @returns Its deprecation info, or undefined if the param is current
 */
export function getDeprecatedParam(
  schema: ZodType,
): DeprecatedParamInfo | undefined {
  return getSchemaTag(schema, DEPRECATED_TAG) as
    | DeprecatedParamInfo
    | undefined;
}

/**
 * Collects the deprecated params in a tool's input schema.
 * @param inputSchema - The tool's input schema
 * @returns Deprecation info keyed by param name
 */
export function collectDeprecatedParams(
  inputSchema: Record<string, ZodType>,
): Record<string, DeprecatedParamInfo> {
  const deprecated: Record<string, DeprecatedParamInfo> = {};

  for (const [key, schema] of Object.entries(inputSchema)) {
    const info = getDeprecatedParam(schema);

    if (info != null) deprecated[key] = info;
  }

  return deprecated;
}

/**
 * Builds the warning shown when a caller sends a deprecated param.
 * @param toolName - Tool the param belongs to
 * @param paramName - The deprecated param that was sent
 * @param info - What to use instead
 * @returns Warning text
 */
export function deprecatedParamWarning(
  toolName: string,
  paramName: string,
  info: DeprecatedParamInfo,
): string {
  return `Warning: ${toolName} param "${paramName}" is deprecated and will be removed; use "${info.replacedBy}" instead`;
}
