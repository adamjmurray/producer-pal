// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { isNotation, type Notation, NOTATIONS } from "#src/shared/notation.ts";
import { logger } from "./file-logger.ts";
import { StdioHttpBridge } from "./stdio-http-bridge.ts";

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

// Main execution function
// Strip trailing slashes from the origin so a value like
// "http://localhost:3350/" doesn't produce "http://localhost:3350//mcp" (404).
const mcpServerOrigin = (
  process.env.MCP_SERVER_ORIGIN ?? "http://localhost:3350"
).replace(/\/+$/, "");
const mcpUrl = `${mcpServerOrigin}/mcp`;
const argv = process.argv.slice(2);
const flags = new Set(argv);
const smallModelMode =
  flags.has("-s") ||
  flags.has("--small-model-mode") ||
  process.env.SMALL_MODEL_MODE === "true";

// Notation override: `--notation <value>` / `-n <value>` (or NOTATION env).
// Invalid values are ignored (device keeps its own setting) with a log line
// rather than crashing the bridge.
const notationValue =
  readOptionArg(argv, ["--notation", "-n"]) ?? process.env.NOTATION;
let notation: Notation | undefined;

if (notationValue != null && isNotation(notationValue)) {
  notation = notationValue;
} else if (notationValue != null) {
  logger.error(
    `Ignoring invalid notation "${notationValue}" (expected one of: ${NOTATIONS.join(", ")})`,
  );
}

// Response-format override: `--format <json|compact>` / `-f <...>` (or FORMAT
// env). `json` requests standard JSON tool output that coding agents can parse
// with JSON tooling; the default `compact` is a token-optimized literal. Only
// pushed when explicitly requested, so an unset flag leaves the device's own
// setting alone. Invalid values are ignored with a log line.
const formatValue =
  readOptionArg(argv, ["--format", "-f"]) ?? process.env.FORMAT;
let jsonOutput: boolean | undefined;

if (formatValue === "json") {
  jsonOutput = true;
} else if (formatValue === "compact") {
  jsonOutput = false;
} else if (formatValue != null) {
  logger.error(
    `Ignoring invalid format "${formatValue}" (expected one of: json, compact)`,
  );
}

logger.info(`Starting Producer Pal bridge (mcpUrl ${mcpUrl})`);

const bridge = new StdioHttpBridge(mcpUrl, {
  smallModelMode,
  notation,
  jsonOutput,
});

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
