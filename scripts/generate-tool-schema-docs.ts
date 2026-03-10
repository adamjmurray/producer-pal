#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toJSONSchema, z } from "zod";
import { STANDARD_TOOL_DEFS } from "#src/mcp-server/create-mcp-server.ts";
import { skills as basicSkills } from "#src/skills/basic.ts";
import { skills as standardSkills } from "#src/skills/standard.ts";
import { type ToolDefFunction } from "#src/tools/shared/tool-framework/define-tool.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "docs/_generated");

/** Max safe integer added by Zod for .int() — not meaningful to display */
const ZOD_INT_MAX = 9007199254740991;

/** Lighter color for constraint/required annotations */
const MUTED = '<span class="vp-doc-muted">';
const MUTED_END = "</span>";

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
 * Formats a JSON Schema property type for display in a markdown table
 * @param prop - JSON Schema property object
 * @param isRequired - Whether the parameter is required
 * @returns Formatted type string with constraint and required annotations
 */
function formatType(prop: JsonSchemaProperty, isRequired: boolean): string {
  const enumValues = prop.enum ?? prop.items?.enum;

  if (enumValues) {
    const prefix =
      prop.type === "array" ? `${MUTED}array of:${MUTED_END} ` : "";
    const values = enumValues.map((v) => `\`"${v}"\``).join(`&nbsp;\\|<br>`);
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

/**
 * Generates a markdown partial for a single tool's parameter schema
 * @param toolDef - Tool definition function with attached options
 * @returns Markdown string with a details/summary block
 */
function generateToolPartial(toolDef: ToolDefFunction): string {
  const { toolOptions } = toolDef;
  const { inputSchema } = toolOptions;
  const schemaKeys = Object.keys(inputSchema);

  if (schemaKeys.length === 0) {
    return `<p class="vp-doc-muted">(no parameters)</p>\n`;
  }

  const objectSchema = z.object(inputSchema);
  const jsonSchema = toJSONSchema(objectSchema) as JsonSchema;
  const properties = jsonSchema.properties ?? {};
  const required = new Set(jsonSchema.required ?? []);

  const lines: string[] = [
    "<details>",
    "<summary>Parameters</summary>",
    "",
    "| Parameter | Type | Description |",
    "|-----------|------|-------------|",
  ];

  for (const key of schemaKeys) {
    const prop = properties[key];

    if (!prop) continue;
    const isRequired = required.has(key) && prop.default == null;
    const type = formatType(prop, isRequired);
    const desc = escapeTableCell(prop.description ?? "");

    lines.push(`| \`${key}\` | ${type} | ${desc} |`);
  }

  lines.push("", "</details>", "");

  return lines.join("\n");
}

/**
 * Wraps a skills markdown string in a details/summary disclosure block
 * @param skills - Raw skills markdown content
 * @param label - Summary label for the disclosure
 * @returns Markdown string with a details/summary block and adjusted headings
 */
function generateSkillsPartial(skills: string, label: string): string {
  const adjusted = skills
    .replace(/^# [^\n]+\n*/m, "") // strip top-level heading
    .replaceAll(/^### /gm, "##### ") // ### → #####
    .replaceAll(/^## /gm, "#### "); // ## → ####

  // Escape <angle brackets> outside code blocks/spans so Vue doesn't parse them
  const escaped = escapeAngleBrackets(adjusted.trim());

  return `::: details ${label}\n\n${escaped}\n\n:::\n`;
}

/**
 * Escapes angle brackets in markdown text, preserving code blocks and inline code
 * @param text - Markdown text with potential bare angle brackets
 * @returns Text with angle brackets escaped outside of code contexts
 */
function escapeAngleBrackets(text: string): string {
  const lines = text.split("\n");
  let inCodeBlock = false;
  const result: string[] = [];

  for (const line of lines) {
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }

    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    // Escape <word> patterns outside of backtick spans
    result.push(
      line.replaceAll(/`[^`]+`|<(\w+)>/g, (match, word: string | undefined) =>
        word != null ? `&lt;${word}&gt;` : match,
      ),
    );
  }

  return result.join("\n");
}

/**
 * Generates tool schema documentation partials for the docs site
 */
async function main(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let count = 0;

  for (const toolDef of STANDARD_TOOL_DEFS) {
    const content = generateToolPartial(toolDef);
    const filename = `${toolDef.toolName}-schema.md`;

    await fs.writeFile(path.join(OUTPUT_DIR, filename), content);
    count++;
  }

  const skillsFiles: [string, string, string][] = [
    [standardSkills, "Standard Skills", "skills-standard.md"],
    [basicSkills, "Basic Skills (small model mode)", "skills-basic.md"],
  ];

  for (const [skills, label, filename] of skillsFiles) {
    const content = generateSkillsPartial(skills, label);

    await fs.writeFile(path.join(OUTPUT_DIR, filename), content);
    count++;
  }

  console.log(`Generated ${count} doc partials in docs/_generated/`);
}

await main();
