// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { isNotation, type Notation, NOTATIONS } from "#src/shared/notation.ts";
import { logger } from "./file-logger.ts";
import { type BridgeOptions, StdioHttpBridge } from "./stdio-http-bridge.ts";

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

// Main execution function
// Strip trailing slashes from the origin so a value like
// "http://localhost:3350/" doesn't produce "http://localhost:3350//mcp" (404).
const mcpServerOrigin = (
  process.env.MCP_SERVER_ORIGIN ?? "http://localhost:3350"
).replace(/\/+$/, "");
const mcpUrl = `${mcpServerOrigin}/mcp`;
const argv = process.argv.slice(2);
const flags = new Set(argv);

// Whether env-var config overrides are honored. Env vars are ambient — the
// Claude Desktop extension always sets them, and a shell can inherit them — so
// they apply only when explicitly opted in via ALLOW_CONFIGURATION_OVERRIDES=
// "true"; otherwise the device / chat UI stay authoritative. Explicit CLI flags
// below are NOT gated: passing a flag is already an intentional per-invocation
// opt-in.
const allowEnvOverrides = process.env.ALLOW_CONFIGURATION_OVERRIDES === "true";

// Small model mode: `-s` / `--small-model-mode` flag (ungated) or the
// SMALL_MODEL_MODE env var (gated). Tri-state — undefined leaves the device's
// own setting alone, while true/false are both pushed so the extension's toggle
// can force the setting on OR off.
let smallModelMode: boolean | undefined;

if (flags.has("-s") || flags.has("--small-model-mode")) {
  smallModelMode = true;
} else if (allowEnvOverrides) {
  smallModelMode = parseBoolEnv(process.env.SMALL_MODEL_MODE);
}

// Direct Live API opt-in: `-l` / `--live-api` flag (ungated) or LIVE_API env (gated).
// Enables the low-level `ppal-live-api` tool at the device level (global — MCP
// clients, REST API, and the chat UI all see it). Advanced escape hatch for
// custom integrations, scripting, and debugging directly against the Live Object
// Model; not recommended as a default. Tri-state like small model mode: false
// turns it off, undefined leaves the device alone.
let liveApiEnabled: boolean | undefined;

if (flags.has("-l") || flags.has("--live-api")) {
  liveApiEnabled = true;
} else if (allowEnvOverrides) {
  liveApiEnabled = parseBoolEnv(process.env.LIVE_API);
}

// Notation override: `--notation <value>` / `-n <value>` flag (ungated) or the
// NOTATION env var (gated). Trimmed and lower-cased so the Claude Desktop
// extension's free-text notation field is forgiving (mcpb user_config has no
// enum type, so it can't be a dropdown). An empty value — the extension's blank
// default — means "no override": leave the device's own setting alone. Other
// invalid values are ignored (device keeps its setting) with a log line rather
// than crashing.
const rawNotation =
  readOptionArg(argv, ["--notation", "-n"]) ??
  (allowEnvOverrides ? process.env.NOTATION : undefined);
const notationValue = rawNotation?.trim().toLowerCase();
let notation: Notation | undefined;

if (
  notationValue != null &&
  notationValue !== "" &&
  isNotation(notationValue)
) {
  notation = notationValue;
} else if (notationValue != null && notationValue !== "") {
  logger.error(
    `Ignoring invalid notation "${rawNotation}" (expected one of: ${NOTATIONS.join(", ")})`,
  );
}

// Response-format override: `--format <json|compact>` / `-f` flag (ungated) or
// FORMAT env (gated). `json` requests standard JSON tool output that coding
// agents can parse with JSON tooling; the default `compact` is a token-optimized
// literal. Unset leaves the device's own setting alone. Invalid values are
// ignored with a log line.
const formatValue =
  readOptionArg(argv, ["--format", "-f"]) ??
  (allowEnvOverrides ? process.env.FORMAT : undefined);
let jsonOutput: boolean | undefined;

if (formatValue === "json") {
  jsonOutput = true;
} else if (formatValue === "compact") {
  jsonOutput = false;
} else if (formatValue != null && formatValue !== "") {
  logger.error(
    `Ignoring invalid format "${formatValue}" (expected one of: json, compact)`,
  );
}

// JSON_OUTPUT env (gated) is a boolean alias for FORMAT, for the Claude Desktop
// extension's toggle (mcpb user_config has no enum type, so it can't offer a
// json/compact dropdown). Tri-state: true forces JSON, false forces compact; an
// explicit --format/FORMAT above wins, and unset leaves the device's own setting
// alone.
if (jsonOutput == null && allowEnvOverrides) {
  jsonOutput = parseBoolEnv(process.env.JSON_OUTPUT);
}

logger.info(`Starting Producer Pal bridge (mcpUrl ${mcpUrl})`);

// Only include an override key when it was actually requested — an undefined
// value means "no override", so the bridge won't push it and the device keeps
// its own setting.
const bridgeOptions: BridgeOptions = {};

if (smallModelMode != null) bridgeOptions.smallModelMode = smallModelMode;
if (notation != null) bridgeOptions.notation = notation;
if (jsonOutput != null) bridgeOptions.jsonOutput = jsonOutput;
if (liveApiEnabled != null) bridgeOptions.liveApiEnabled = liveApiEnabled;

const bridge = new StdioHttpBridge(mcpUrl, bridgeOptions);

// Handle graceful shutdown
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down...");
  void bridge.stop().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down...");
  void bridge.stop().then(() => process.exit(0));
});

// Start the bridge - this should always succeed
try {
  await bridge.start();
} catch (error) {
  logger.error(`Failed to start bridge: ${errorMessage(error)}`);
  process.exit(1);
}
