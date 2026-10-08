// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The portal's own tool answers, shaped like the device's: a failure reads
// "Error: <why>", a result is compact JS literal text.

import { toCompactJSLiteral } from "#src/shared/compact/compact-serializer.ts";
import {
  formatErrorResponse,
  formatSuccessResponse,
  type McpResponse,
} from "#src/shared/mcp-responses.ts";

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
