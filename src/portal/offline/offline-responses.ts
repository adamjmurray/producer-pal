// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The portal's own tool answers, shaped like the device's: a failure reads
// "Error: <why>", a result is compact JS literal text.

import { VERSION } from "#src/shared/config.ts";
import { toCompactJSLiteral } from "#src/shared/compact/compact-serializer.ts";
import { canonicalManageAction } from "#src/tools/core/helpers/manage-contract.ts";
import {
  formatErrorResponse,
  formatSuccessResponse,
  type McpResponse,
} from "#src/shared/mcp-responses.ts";
import { SETUP_URL } from "./offline-setup-hints.ts";

/**
 * @param message - Why the call failed, and what state it left
 * @returns The error response
 */
export function offlineError(message: string): McpResponse {
  return formatErrorResponse(`Error: ${message}`);
}

/**
 * @param result - What the call did
 * @returns The success response
 */
export function offlineResult(result: object): McpResponse {
  return formatSuccessResponse(toCompactJSLiteral(result));
}

/**
 * @param httpUrl - The device's MCP URL the portal was given
 * @returns The error response for a URL the portal can't reach a device at
 */
export function invalidUrlResponse(httpUrl: string): McpResponse {
  return formatErrorResponse(`❌ Invalid MCP server URL: "${httpUrl.replace(/\/mcp$/, "")}"

The URL must include protocol (e.g. http://localhost:3350).
Tell the user to check ${SETUP_URL} for configuration help.

(Producer Pal ${VERSION})`);
}

const SETUP_VERBS: Record<string, string> = {
  "install-producer-pal": "install",
  "add-producer-pal": "add",
  "update-producer-pal": "update",
};

/**
 * Refuse an install, add or update for a device on another computer: they copy
 * files on this machine.
 * @param host - The device's `host[:port]`
 * @param action - The ppal-manage action called
 * @param deviceOlder - Whether the running device is older than this portal
 * @returns The error response
 */
export function remoteSetupRefusal(
  host: string,
  action: unknown,
  deviceOlder = false,
): McpResponse {
  const verb = SETUP_VERBS[String(canonicalManageAction(action))] ?? "set up";
  const older = deviceOlder
    ? " Producer Pal there is older than this connector."
    : "";

  return offlineError(
    `This connector points at another computer (${host}), so it can't ${verb} Producer Pal there. That needs files copied on Live's computer.${older} Run it from a connector on Live's computer, or set up the device by hand: ${SETUP_URL}`,
  );
}
