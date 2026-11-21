// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { errorMessage } from "#src/shared/error-message.ts";
import {
  formatErrorResponse,
  type McpResponse,
} from "#src/shared/mcp-responses.ts";
import { logger } from "../../file-logger.ts";
import { droppedMidCallResponse } from "../../offline/offline-responses.ts";
import { forwardedSetupTimeout } from "../../offline/setup-call-timeout.ts";

// Widened to number on purpose: the code read off a thrown error is an
// unknown narrowed to number, which shares no enum type with ErrorCode, and
// comparing the two directly is what no-unsafe-enum-comparison reports. A
// local `as number` does not survive --fix (no-unnecessary-type-assertion
// deletes it), so the widening lives here instead.
const CONNECTION_CLOSED_CODE: number = ErrorCode.ConnectionClosed;
const REQUEST_TIMEOUT_CODE: number = ErrorCode.RequestTimeout;

export interface ForwardedCallFailure {
  /** The answer, or null to answer as if the device were offline */
  response: McpResponse | null;
  /** Whether the connection is gone, so the next call reconnects */
  connectionLost: boolean;
}

/**
 * Sort out a call the bridge forwarded to the device that threw.
 * @param error - What the call threw
 * @param args - The tool call's arguments
 * @param setupCall - Whether it is a setup call with its own budget
 * @returns The answer and whether the connection is gone
 */
export function forwardedCallFailure(
  error: unknown,
  args: Record<string, unknown>,
  setupCall: boolean,
): ForwardedCallFailure {
  const code =
    error != null && typeof error === "object" && "code" in error
      ? error.code
      : undefined;

  // No code: a network failure, so the device is unreachable.
  if (typeof code !== "number") {
    return { response: null, connectionLost: true };
  }

  // A setup call's budget ran out while the device had the request (a connect
  // that ran out is wrapped, with no code). The connection is still alive.
  if (setupCall && code === REQUEST_TIMEOUT_CODE) {
    return {
      response: forwardedSetupTimeout(args, true),
      connectionLost: false,
    };
  }

  // The device had the call and may still finish it: a drop doesn't mean it's
  // gone (switching Remote Control drops every connection).
  if (code === CONNECTION_CLOSED_CODE) {
    return { response: droppedMidCallResponse(), connectionLost: true };
  }

  // Any other code is a JSON-RPC error from the device, on a live connection
  // (a timeout included).
  logger.debug(
    `[Bridge] MCP protocol error detected (code ${code}), returning the error to the client`,
  );

  const message = errorMessage(error);
  const prefix = `MCP error ${code}: `;

  return {
    response: formatErrorResponse(
      message.startsWith(prefix) ? message.slice(prefix.length) : message,
    ),
    connectionLost: false,
  };
}
