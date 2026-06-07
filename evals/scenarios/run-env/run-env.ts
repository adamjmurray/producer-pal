// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The eval run environment — the assembled "settings panel" state that mirrors
 * the Max for Live / webui device settings (small-model toggle, JSON-output
 * toggle, tool subset, Live API toggle). The CLI builds one RunEnv from flags
 * and applies it to every scenario via setConfig; a test declares `requires`
 * and is SKIPPED (not failed) when the active RunEnv can't satisfy it, keeping
 * scores apples-to-apples.
 */

import { TOOL_NAMES } from "#src/mcp-server/create-mcp-server.ts";
import { toolDefLiveApi } from "#src/tools/advanced/live-api.def.ts";

/** Full tool name of the opt-in Direct Live API tool (not in TOOL_NAMES). */
const LIVE_API_TOOL_NAME = toolDefLiveApi.toolName;

/** The assembled run environment applied to the MCP server for every scenario. */
export interface RunEnv {
  /** Small-model mode: basic skills tier + reduced param schemas. */
  smallModelMode: boolean;
  /** JSON tool-result output. False = compact (the product default). */
  jsonOutput: boolean;
  /** Tool allow-list (full `ppal-` names). */
  tools: string[];
  /** Whether the opt-in Direct Live API tool is enabled. */
  liveApiEnabled: boolean;
}

/** CLI flag inputs used to assemble a RunEnv. */
export interface RunEnvOptions {
  smallModel?: boolean;
  json?: boolean;
  tools?: string;
  liveApi?: boolean;
}

/**
 * Build the run environment from CLI flags. Mirrors the device settings panel:
 * the operator picks small-model mode, output format, a tool subset, and whether
 * the Live API tool is on; then every scenario runs against that environment.
 *
 * @param options - Parsed CLI flags
 * @returns The assembled run environment
 */
export function buildRunEnv(options: RunEnvOptions): RunEnv {
  const liveApiEnabled = options.liveApi ?? false;

  return {
    smallModelMode: options.smallModel ?? false,
    jsonOutput: options.json ?? false,
    tools: resolveTools(options.tools, liveApiEnabled),
    liveApiEnabled,
  };
}

/**
 * Resolve the `--tools` argument to a deduped list of full tool names.
 * Undefined → all standard tools. Accepts short (`connect`) or full
 * (`ppal-connect`) names. When `liveApi` is set, the Live API tool is unioned in
 * (it may also be named explicitly in the list). Throws on an unknown name.
 *
 * @param toolsArg - Comma-separated tool names, or undefined for all standard
 * @param liveApi - Whether to include the opt-in Live API tool
 * @returns Deduped full tool names
 */
export function resolveTools(
  toolsArg: string | undefined,
  liveApi: boolean,
): string[] {
  const names =
    toolsArg == null
      ? [...TOOL_NAMES]
      : toolsArg
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t !== "")
          .map(toFullToolName);

  validateToolNames(names);

  const set = new Set(names);

  if (liveApi) set.add(LIVE_API_TOOL_NAME);

  return [...set];
}

/**
 * Format a run environment as a compact, filename-safe label. The all-default
 * environment is "default"; otherwise the active modifiers are hyphenated
 * (e.g. "small-model", "json", "live-api", "tools-7"). Used for result
 * filenames, table columns, and the `[label]` suffix in printed results.
 *
 * @param env - The run environment
 * @returns A deterministic kebab-case label
 */
export function envLabel(env: RunEnv): string {
  const parts: string[] = [];

  if (env.smallModelMode) parts.push("small-model");
  if (env.jsonOutput) parts.push("json");
  if (env.liveApiEnabled) parts.push("live-api");

  const standardCount = env.tools.filter(
    (t) => t !== LIVE_API_TOOL_NAME,
  ).length;

  if (standardCount < TOOL_NAMES.length) parts.push(`tools-${standardCount}`);

  return parts.length === 0 ? "default" : parts.join("-");
}

/**
 * Convert a short tool name to its full `ppal-` form. Already-prefixed names
 * pass through unchanged. Does not validate against the known set.
 *
 * @param name - Short (`connect`) or full (`ppal-connect`) tool name
 * @returns The full `ppal-` tool name
 */
export function toFullToolName(name: string): string {
  const trimmed = name.trim();

  return trimmed.startsWith("ppal-") ? trimmed : `ppal-${trimmed}`;
}

/**
 * Validate resolved tool names against the known set (standard tools + the
 * opt-in Live API tool). Throws on the first unknown name.
 *
 * @param names - Full tool names to validate
 */
function validateToolNames(names: string[]): void {
  const known = new Set<string>([...TOOL_NAMES, LIVE_API_TOOL_NAME]);

  for (const name of names) {
    if (!known.has(name)) {
      const valid = [...TOOL_NAMES, LIVE_API_TOOL_NAME].join(", ");

      throw new Error(`Unknown tool: ${name}. Valid tools: ${valid}`);
    }
  }
}
