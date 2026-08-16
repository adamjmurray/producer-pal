// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Params that are accepted but not published. Two intents, one mechanism:
//
//   deprecatedParam — going away. Callers that still send it keep working while
//     they migrate, and the model never learns the retired name.
//   aliasParam — permanent. Catches a name models reach for on their own and
//     folds it onto the real param, so a well-founded guess succeeds instead of
//     costing a round trip.
//
// Dropping a param from a tool's inputSchema is not enough for either:
// define-tool derives its expected keys from that schema, so the param would be
// stripped before the handler ran and the caller told it was ignored — a
// silently dropped destination, which is the exact failure this codebase
// already paid for once.
//
// A hidden param stays in the schema that validates, and is left out of the
// schema that gets published.

import { type ZodType } from "zod";
import {
  describeWithTags,
  getSchemaTag,
  tagSchema,
} from "#src/tools/shared/tool-framework/schema-tags.ts";

export interface DeprecatedParamInfo {
  kind: "deprecated";
  /** Param name to use instead, named in the warning. */
  replacedBy: string;
}

export interface AliasParamInfo {
  kind: "alias";
  /** The param this one folds into, named in the warning. */
  canonical: string;
  /** Example value for the canonical param, shown in the warning. */
  example?: string;
}

export type HiddenParamInfo = DeprecatedParamInfo | AliasParamInfo;

// Tags the schema instance without changing its type, so every other consumer
// still sees an ordinary ZodType. See schema-tags.ts.
const HIDDEN_TAG = Symbol("hiddenParam");

/**
 * Marks a param as deprecated: still accepted and validated, no longer
 * published to the model. Composes with {@link param} in either order.
 * @param schema - The param's Zod schema
 * @param info - What to use instead
 * @returns The schema, tagged as deprecated
 */
export function deprecatedParam<T extends ZodType>(
  schema: T,
  info: Omit<DeprecatedParamInfo, "kind">,
): T {
  return tagSchema(
    describeWithTags(schema, `deprecated: use ${info.replacedBy}`),
    HIDDEN_TAG,
    { kind: "deprecated", ...info } satisfies DeprecatedParamInfo,
  );
}

/**
 * Marks a param as a permanent alias for another one: accepted and validated,
 * never published. For names models reach for unprompted — catching the guess
 * beats making them read an error and try again. Composes with {@link param} in
 * either order.
 * @param schema - The param's Zod schema
 * @param info - The param this one folds into
 * @returns The schema, tagged as an alias
 */
export function aliasParam<T extends ZodType>(
  schema: T,
  info: Omit<AliasParamInfo, "kind">,
): T {
  return tagSchema(
    describeWithTags(schema, `alias for ${info.canonical}`),
    HIDDEN_TAG,
    { kind: "alias", ...info } satisfies AliasParamInfo,
  );
}

/**
 * Reads the hidden-param tag attached by {@link deprecatedParam} or
 * {@link aliasParam}.
 * @param schema - A param schema
 * @returns Why the param is hidden, or undefined if it is published
 */
export function getHiddenParam(schema: ZodType): HiddenParamInfo | undefined {
  return getSchemaTag(schema, HIDDEN_TAG) as HiddenParamInfo | undefined;
}

/**
 * Collects the hidden params in a tool's input schema.
 * @param inputSchema - The tool's input schema
 * @returns Hidden-param info keyed by param name, in schema order
 */
export function collectHiddenParams(
  inputSchema: Record<string, ZodType>,
): Record<string, HiddenParamInfo> {
  const hidden: Record<string, HiddenParamInfo> = {};

  for (const [key, schema] of Object.entries(inputSchema)) {
    const info = getHiddenParam(schema);

    if (info != null) hidden[key] = info;
  }

  return hidden;
}

/**
 * Builds the warnings shown when a caller sends hidden params. Deprecations get
 * a line each; aliases are grouped by the param they fold into, so a model that
 * sent two halves of one destination reads one correction rather than two.
 * @param toolName - Tool the params belong to
 * @param usedKeys - Hidden params the caller actually sent, in schema order
 * @param hidden - Hidden-param info keyed by param name
 * @returns Warning texts, empty when nothing hidden was sent
 */
export function hiddenParamWarnings(
  toolName: string,
  usedKeys: string[],
  hidden: Record<string, HiddenParamInfo>,
): string[] {
  const warnings: string[] = [];
  const aliasGroups = new Map<string, { keys: string[]; example?: string }>();

  for (const key of usedKeys) {
    const info = hidden[key];

    if (info == null) continue;

    if (info.kind === "deprecated") {
      warnings.push(
        `Warning: ${toolName} param "${key}" is deprecated and will be removed; use "${info.replacedBy}" instead`,
      );
      continue;
    }

    const group = aliasGroups.get(info.canonical) ?? {
      keys: [],
      example: info.example,
    };

    group.keys.push(key);
    aliasGroups.set(info.canonical, group);
  }

  for (const [canonical, { keys, example }] of aliasGroups) {
    const names = keys.map((key) => `"${key}"`).join(", ");
    const hint = example == null ? "" : ` (e.g. ${canonical}: "${example}")`;

    warnings.push(
      `Warning: ${toolName} accepts ${names} as a fallback; the parameter is "${canonical}"${hint}`,
    );
  }

  return warnings;
}
