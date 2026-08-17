// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The markdown the docs site embeds for each tool's schema. Split out from the
// generator script so it can be tested without running the script's file I/O.
//
// Everything here reads the PUBLISHED schema, never the raw one: a deprecated
// param is still accepted but is not part of the surface, and both docs/
// outputs are read by models.

import { toJSONSchema, z } from "zod";
import {
  NOTATION_LABELS,
  NOTATIONS,
  type Notation,
} from "#src/shared/notation.ts";
import { type ToolDefFunction } from "#src/tools/shared/tool-framework/define-tool.ts";
import { resolveParamModes } from "#src/tools/shared/tool-framework/modal-config.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";

/** Max safe integer added by Zod for .int() — not meaningful to display */
const ZOD_INT_MAX = 9007199254740991;

/** Lighter color for constraint/required annotations */
const MUTED = '<span class="vp-doc-muted">';
const MUTED_END = "</span>";

/** Marker for large-model-only params and enum values */
const LARGE_ONLY_MARKER = "🐘";

interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  items?: { enum?: string[] };
  default?: unknown;
}

interface JsonSchema {
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

/**
 * Generates a markdown partial for a single tool's parameter schema
 * @param toolDef - Tool definition function with attached options
 * @returns Markdown string with a details/summary block
 */
export function generateToolPartial(toolDef: ToolDefFunction): string {
  const { toolOptions } = toolDef;
  const inputSchema = resolveToolSchema(toolOptions.inputSchema, {}).published;
  const schemaKeys = Object.keys(inputSchema);

  if (schemaKeys.length === 0) {
    return `<p class="vp-doc-muted">(no parameters)</p>\n`;
  }

  // What small-model mode drops/trims, derived from each param's co-located
  // modes, so the docs mark large-only params and enum values.
  const smallModel = resolveParamModes(inputSchema, { smallModelMode: true });
  const excludedParams = new Set(smallModel.excludeParams);
  const excludedEnumMap = smallModel.excludeEnumValues;

  const { properties, required } = describeSchema(inputSchema);

  const lines: string[] = [
    "<details>",
    "<summary>Parameters</summary>",
    "",
    "| Parameter | Type | Description |",
    "|-----------|------|-------------|",
  ];

  let hasMarker = false;

  for (const key of schemaKeys) {
    const prop = properties[key];

    if (!prop) continue;
    const isRequired = required.has(key) && prop.default == null;

    const paramExcludedValues = excludedEnumMap[key];
    const excludedSet = paramExcludedValues
      ? new Set(paramExcludedValues)
      : undefined;

    if (excludedSet && (prop.enum ?? prop.items?.enum)) {
      hasMarker = true;
    }

    const type = formatType(prop, isRequired, excludedSet);
    const desc = escapeTableCell(prop.description ?? "");
    const isExcluded = excludedParams.has(key);

    if (isExcluded) hasMarker = true;
    const paramCell = isExcluded
      ? `\`${key}\` ${LARGE_ONLY_MARKER}`
      : `\`${key}\``;

    lines.push(`| ${paramCell} | ${type} | ${desc} |`);
  }

  if (hasMarker) {
    lines.push(
      "",
      `_${LARGE_ONLY_MARKER} = large model only (hidden in small model mode)_`,
    );
  }

  lines.push("", "</details>", "");

  return lines.join("\n");
}

/**
 * Generates a markdown partial showing how the notation-keyed tool params read
 * under one notation — the text the AI actually receives in the tool schema.
 * Resolves the standard (large-model) cell only: small model mode rewrites these
 * descriptions and hides other params, so the summary says which mode this is.
 * @param toolDefs - All tool definitions to scan
 * @param notation - The notation to resolve descriptions for
 * @returns Markdown table of tool/param descriptions under that notation
 */
export function generateNotationParamsPartial(
  toolDefs: ToolDefFunction[],
  notation: Notation,
): string {
  const notationKeyed = findNotationKeyedParams(toolDefs);

  const lines: string[] = [
    "<details>",
    `<summary>Tool parameters under ${NOTATION_LABELS[notation]} (standard mode)</summary>`,
    "",
    "| Tool | Parameter | Description |",
    "|------|-----------|-------------|",
  ];

  for (const toolDef of toolDefs) {
    const params = notationKeyed.get(toolDef.toolName);

    if (params == null) continue;

    const { published } = resolveToolSchema(toolDef.toolOptions.inputSchema, {
      notation,
    });
    const { properties } = describeSchema(published);

    for (const key of params) {
      // `published` already carries the notation's description override, and
      // falls back to the param's default text (bar|beat is the default
      // notation, so it has no override cell).
      const desc = properties[key]?.description ?? "";

      lines.push(
        `| \`${toolDef.toolName}\` | \`${key}\` | ${escapeTableCell(desc)} |`,
      );
    }
  }

  lines.push("", "</details>", "");

  return lines.join("\n");
}

// --- Helpers below main exports ---

/**
 * Finds the published params whose description is notation-keyed — i.e. any
 * param that a non-default notation overrides. Derived from the defs rather than
 * hardcoded, so a newly notation-keyed param shows up in the docs automatically.
 * @param toolDefs - All tool definitions to scan
 * @returns Param keys, per tool name, that vary by notation
 */
function findNotationKeyedParams(
  toolDefs: ToolDefFunction[],
): Map<string, string[]> {
  const byTool = new Map<string, string[]>();

  for (const toolDef of toolDefs) {
    const { inputSchema } = toolDef.toolOptions;
    const keys = new Set<string>();

    for (const notation of NOTATIONS) {
      const { published } = resolveToolSchema(inputSchema, { notation });
      const { descriptionOverrides } = resolveParamModes(inputSchema, {
        notation,
      });

      for (const key of Object.keys(descriptionOverrides)) {
        if (key in published) keys.add(key);
      }
    }

    if (keys.size > 0) byTool.set(toolDef.toolName, [...keys]);
  }

  return byTool;
}

/**
 * Reads a schema's JSON Schema properties and required set.
 * @param schema - Param schemas, keyed by param name
 * @returns Its JSON Schema properties, and which params are required
 */
function describeSchema(schema: Record<string, z.ZodType>): {
  properties: Record<string, JsonSchemaProperty>;
  required: Set<string>;
} {
  const jsonSchema = toJSONSchema(z.object(schema)) as JsonSchema;

  return {
    properties: jsonSchema.properties ?? {},
    required: new Set(jsonSchema.required ?? []),
  };
}

/**
 * Formats a JSON Schema property type for display in a markdown table
 * @param prop - JSON Schema property object
 * @param isRequired - Whether the parameter is required
 * @param excludedEnumValues - Enum values excluded in small model mode
 * @returns Formatted type string with constraint and required annotations
 */
function formatType(
  prop: JsonSchemaProperty,
  isRequired: boolean,
  excludedEnumValues?: Set<string>,
): string {
  const enumValues = prop.enum ?? prop.items?.enum;

  if (enumValues) {
    const prefix =
      prop.type === "array" ? `${MUTED}array of:${MUTED_END}<br>` : "";
    const values = enumValues
      .map((v) => {
        const badge = excludedEnumValues?.has(v)
          ? `&nbsp;${LARGE_ONLY_MARKER}`
          : "";

        return `\`"${v}"\`${badge}`;
      })
      .join(`&nbsp;\\|<br>`);
    const suffix = isRequired ? `<br>${MUTED}(required)${MUTED_END}` : "";

    return prefix + values + suffix;
  }

  let type = prop.type ?? "unknown";
  const annotations: string[] = [];

  const hasMin = prop.minimum != null;
  const hasMax = prop.maximum != null && prop.maximum < ZOD_INT_MAX;

  if (hasMin && hasMax) {
    annotations.push(`${prop.minimum}–${prop.maximum}`);
  } else if (hasMin && (prop.minimum as number) > 0) {
    annotations.push(`≥ ${prop.minimum}`);
  } else if (hasMin && (prop.minimum as number) === 0) {
    annotations.push("≥ 0");
  } else if (hasMax) {
    annotations.push(`≤ ${prop.maximum}`);
  }

  if (isRequired) {
    annotations.push("required");
  }

  if (annotations.length > 0) {
    type += ` <nobr>${MUTED}(${annotations.join(", ")})${MUTED_END}</nobr>`;
  }

  return type;
}

/**
 * Escapes special markdown characters for use inside a table cell
 * @param text - Raw text to escape
 * @returns Escaped text safe for markdown tables
 */
function escapeTableCell(text: string): string {
  return text
    .replaceAll("|", "\\|")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "<br>");
}
