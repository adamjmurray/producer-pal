// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { isNotation, type Notation, NOTATIONS } from "#src/shared/notation.ts";
import { logger } from "./file-logger.ts";
import { StdioHttpBridge } from "./stdio-http-bridge.ts";

/**
 * Read the `--notation` option value from argv, accepting both
 * `--notation midi-json` and `--notation=midi-json`. Falls back to undefined
 * when the option is absent (caller then checks the NOTATION env var).
 *
 * @param argv - CLI arguments (process.argv without node + script path)
 * @returns The raw notation value, or undefined when not provided
 */
function readNotationArg(argv: string[]): string | undefined {
  const inline = argv.find((a) => a.startsWith("--notation="));

  if (inline) return inline.slice("--notation=".length);

  const idx = argv.indexOf("--notation");

  if (idx !== -1 && idx + 1 < argv.length) return argv[idx + 1];

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

// Notation override: `--notation <value>` (or NOTATION env). Invalid values are
// ignored (device keeps its own setting) with a log line rather than crashing
// the bridge. Recommended for coding agents: `--notation midi-json`.
const notationValue = readNotationArg(argv) ?? process.env.NOTATION;
let notation: Notation | undefined;

if (notationValue != null && isNotation(notationValue)) {
  notation = notationValue;
} else if (notationValue != null) {
  logger.error(
    `Ignoring invalid notation "${notationValue}" (expected one of: ${NOTATIONS.join(", ")})`,
  );
}

logger.info(`Starting Producer Pal bridge (mcpUrl ${mcpUrl})`);

const bridge = new StdioHttpBridge(mcpUrl, { smallModelMode, notation });

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
