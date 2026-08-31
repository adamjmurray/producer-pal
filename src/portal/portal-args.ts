// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isNotation, type Notation, NOTATIONS } from "#src/shared/notation.ts";
import {
  ALL_TOOL_IDS,
  CONNECT_TOOL_ID,
  resolveToolNames,
  toToolName,
} from "#src/shared/tool-groups.ts";
import { logger } from "./file-logger.ts";
import { type BridgeOptions } from "./portal-settings.ts";

type Env = Record<string, string | undefined>;

export interface PortalArgs {
  /** The device's MCP endpoint. */
  mcpUrl: string;
  /** Only the overrides actually requested, so unset options leave the device alone. */
  bridgeOptions: BridgeOptions;
  /** `--list-tools`: print the catalog and exit without starting the bridge. */
  listTools: boolean;
}

/**
 * Parse the portal's CLI flags and env vars into everything the bridge needs.
 *
 * Flags and env vars both apply directly: every setting rides as a per-request
 * header, so it reaches only this client and can't disturb the device or any
 * other client. See dev/decisions/0033-portal-settings-are-per-client.md.
 *
 * Invalid values are logged and ignored rather than fatal, so a portal cached by
 * npx still starts against a device it doesn't fully understand.
 *
 * @param argv - CLI arguments (process.argv without node + script path)
 * @param env - The process environment
 * @returns The parsed portal configuration
 */
export function parsePortalArgs(argv: string[], env: Env): PortalArgs {
  const flags = new Set(argv);

  // Strip trailing slashes from the origin so a value like
  // "http://localhost:3350/" doesn't produce "http://localhost:3350//mcp" (404).
  const mcpServerOrigin = (
    env.MCP_SERVER_ORIGIN ?? "http://localhost:3350"
  ).replace(/\/+$/, "");

  const bridgeOptions: BridgeOptions = {};

  // Small model mode: `-s` / `--small-model-mode` flag or the SMALL_MODEL_MODE
  // env var. Tri-state — undefined leaves the device's own setting alone, while
  // true/false are both sent so the extension's toggle can force it on OR off.
  const smallModelMode =
    flags.has("-s") || flags.has("--small-model-mode")
      ? true
      : parseBoolEnv(env.SMALL_MODEL_MODE);

  // Direct Live API opt-in: `-l` / `--live-api` flag or the LIVE_API env var.
  // Enables the low-level `ppal-live-api` tool for THIS client only —
  // it rides as a request header, so an agent under evaluation on the same
  // device still doesn't see it. Advanced escape hatch for custom integrations,
  // scripting, and debugging directly against the Live Object Model; not
  // recommended as a default.
  const liveApiEnabled =
    flags.has("-l") || flags.has("--live-api")
      ? true
      : parseBoolEnv(env.LIVE_API);

  if (smallModelMode != null) bridgeOptions.smallModelMode = smallModelMode;
  if (liveApiEnabled != null) bridgeOptions.liveApiEnabled = liveApiEnabled;

  const notation = resolveNotationArg(argv, env.NOTATION);

  if (notation != null) bridgeOptions.notation = notation;

  const jsonOutput = resolveJsonOutputArg(argv, env.FORMAT, env.JSON_OUTPUT);

  if (jsonOutput != null) bridgeOptions.jsonOutput = jsonOutput;

  const disabledTools = resolveDisabledTools(
    readOptionArg(argv, ["--tools"]) ?? env.TOOLS,
    readOptionArg(argv, ["--disable-tools"]) ?? env.DISABLE_TOOLS,
  );

  if (disabledTools != null) bridgeOptions.disabledTools = disabledTools;

  return {
    mcpUrl: `${mcpServerOrigin}/mcp`,
    bridgeOptions,
    listTools: flags.has("--list-tools"),
  };
}

/**
 * Read an option value from argv, accepting long/short aliases in both the
 * `--name value` / `-x value` and `--name=value` / `-x=value` forms. Falls back
 * to undefined when none of the aliases are present (caller then checks the
 * corresponding env var).
 *
 * @param argv - CLI arguments (process.argv without node + script path)
 * @param names - Option aliases to match, e.g. `["--notation", "-n"]`
 * @returns The raw option value, or undefined when not provided
 */
function readOptionArg(argv: string[], names: string[]): string | undefined {
  for (const name of names) {
    const prefix = `${name}=`;
    const inline = argv.find((a) => a.startsWith(prefix));

    if (inline) return inline.slice(prefix.length);

    const idx = argv.indexOf(name);

    if (idx !== -1 && idx + 1 < argv.length) return argv[idx + 1];
  }

  return undefined;
}

/**
 * Parse a strict boolean env var: `"true"` → true, `"false"` → false, and
 * undefined for anything else (empty, unset, or unrecognized) — i.e. "no
 * override". Lets a Desktop-extension toggle force a setting on OR off, while an
 * absent/blank value leaves the device's own setting untouched.
 *
 * @param value - Raw env var value
 * @returns The boolean, or undefined when not a recognized boolean
 */
function parseBoolEnv(value: string | undefined): boolean | undefined {
  if (value === "true") return true;

  if (value === "false") return false;

  return undefined;
}

/**
 * Resolve the notation override from `--notation <value>` / `-n <value>` or the
 * NOTATION env var. Trimmed and lower-cased so the Claude Desktop extension's
 * free-text notation field is forgiving (mcpb user_config has no enum type, so it
 * can't be a dropdown). An empty value — the extension's blank default — means
 * "no override".
 *
 * @param argv - CLI arguments
 * @param envNotation - The NOTATION env var, if set
 * @returns The notation, or undefined for no override
 */
function resolveNotationArg(
  argv: string[],
  envNotation: string | undefined,
): Notation | undefined {
  const raw = readOptionArg(argv, ["--notation", "-n"]) ?? envNotation;
  const value = raw?.trim().toLowerCase();

  if (value == null || value === "") return undefined;

  if (isNotation(value)) return value;

  logger.error(
    `Ignoring invalid notation "${raw}" (expected one of: ${NOTATIONS.join(", ")})`,
  );

  return undefined;
}

/**
 * Resolve the response-format override. `--format <json|compact>` / `-f` (or the
 * FORMAT env var) is the primary spelling; JSON_OUTPUT is a boolean alias for the
 * Claude Desktop extension's toggle, which can't offer a dropdown, and an
 * explicit format wins over it. `json` requests standard JSON tool output that
 * coding agents can parse with JSON tooling; the default `compact` is a
 * token-optimized literal.
 *
 * @param argv - CLI arguments
 * @param envFormat - The FORMAT env var, if set
 * @param envJsonOutput - The JSON_OUTPUT env var, if set
 * @returns True for JSON, false for compact, undefined for no override
 */
function resolveJsonOutputArg(
  argv: string[],
  envFormat: string | undefined,
  envJsonOutput: string | undefined,
): boolean | undefined {
  const format = readOptionArg(argv, ["--format", "-f"]) ?? envFormat;

  if (format === "json") return true;

  if (format === "compact") return false;

  if (format != null && format !== "") {
    logger.error(
      `Ignoring invalid format "${format}" (expected one of: json, compact)`,
    );
  }

  return parseBoolEnv(envJsonOutput);
}

/**
 * Resolve the tools to withhold from this client, from `--tools` (a whitelist,
 * how people actually think about it) and `--disable-tools` (a subtraction,
 * matching the header's native semantics). Given both, the subtraction applies
 * last.
 *
 * `--tools` becomes a local complement over the FULL catalog so both flags feed
 * the one `x-producer-pal-disabled-tools` header. Consequence worth knowing: the
 * complement is a snapshot of what this portal build knows, so a tool the device
 * added after the portal was cached isn't in it and stays enabled. There is no
 * fix from here — the complement can only name tools this build has heard of.
 *
 * `--disable-tools` names tools directly, so an unrecognized item is forwarded
 * to the device rather than dropped (see forwardUnknownTool) and a newer tool
 * can still be withheld. Its own limit is groups: the header carries tool
 * names, so a GROUP added in a newer version resolves to nothing.
 *
 * `ppal-connect` is never withheld. A subagent worker drops it on purpose (it is
 * briefed instead of connecting), but an external MCP client that loses connect
 * loses its entry point and the entire Skills blob.
 *
 * @param rawTools - The `--tools` / TOOLS value, if any
 * @param rawDisable - The `--disable-tools` / DISABLE_TOOLS value, if any
 * @returns The tool names to withhold, or undefined when nothing was requested
 */
function resolveDisabledTools(
  rawTools: string | undefined,
  rawDisable: string | undefined,
): string[] | undefined {
  const disabled = new Set<string>();
  const forwarded: string[] = [];

  if (rawTools?.trim()) {
    const keep = new Set(resolveToolNames(rawTools, warnUnknownTool));

    for (const id of ALL_TOOL_IDS) {
      if (!keep.has(id)) disabled.add(id);
    }
  }

  if (rawDisable?.trim()) {
    for (const id of resolveToolNames(rawDisable, (item) =>
      forwarded.push(forwardUnknownTool(item)),
    )) {
      disabled.add(id);
    }
  }

  if (disabled.delete(CONNECT_TOOL_ID)) {
    logger.info(`Keeping ${CONNECT_TOOL_ID}: MCP clients need the entry point`);
  }

  const names = [
    ...ALL_TOOL_IDS.filter((id) => disabled.has(id)),
    ...forwarded,
  ];

  if (names.length === 0) return undefined;

  logger.info(`Withholding tools from this client: ${names.join(", ")}`);

  return names;
}

/**
 * Log an unrecognized `--tools` item. Ignored rather than fatal so an
 * npx-cached portal still starts against a newer device — and a name this
 * build doesn't know is one the whitelist's complement can't withhold anyway,
 * so the tool it names stays enabled either way.
 * @param item - The item as the user spelled it
 */
function warnUnknownTool(item: string): void {
  logger.error(`Ignoring unknown tool or group "${item}"`);
}

/**
 * Handle an unrecognized `--disable-tools` item by passing it to the device
 * instead of dropping it. A subtraction can name a tool this build has never
 * heard of, and the device is the side that knows its own catalog, so an
 * npx-cached portal can still withhold a tool added after it was cached.
 *
 * A name that matches nothing on the device (a typo) subtracts nothing, which
 * is the same outcome as dropping it here. Group aliases added in a newer
 * version still don't resolve: the header carries tool names, and the device
 * matches them exactly.
 * @param item - The item as the user spelled it
 * @returns The normalized tool name to forward
 */
function forwardUnknownTool(item: string): string {
  const name = toToolName(item);

  logger.info(`Unknown to this portal build, passing "${name}" to the device`);

  return name;
}
