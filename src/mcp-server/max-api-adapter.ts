// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Adapter for communication between Node.js MCP server and Max v8 environment

import crypto from "node:crypto";
import Max from "max-api";
import { errorMessage } from "#src/shared/error-utils.ts";
import {
  formatErrorResponse,
  MAX_ERROR_DELIMITER,
  WARNING_PREFIX,
  type McpErrorCode,
} from "#src/shared/mcp-response-utils.ts";
import { ensureSilenceWav } from "#src/shared/silent-wav-generator.ts";
import { handleCodeExecRequest } from "./code-exec-protocol.ts";
import { type RequestOverrides } from "./helpers/request-overrides/request-overrides.ts";
import * as console from "./node-for-max-logger.ts";
import { handleNodeRequest } from "./rpc/node-request-protocol.ts";

// Re-export for convenience so existing consumers can keep importing from here
export {
  MAX_TIMEOUT_MS,
  type RequestOverrides,
} from "./helpers/request-overrides/request-overrides.ts";

export interface McpResponseContent {
  type: string;
  text: string;
}

export interface McpResponse {
  content: McpResponseContent[];
  isError?: boolean;
  /**
   * Structured error category. Set only at specific error origins (currently
   * just the tool-call timeout) so transports can distinguish a timeout from
   * an ordinary tool error without string-matching the message.
   */
  errorCode?: McpErrorCode;
}

interface PendingRequest {
  resolve: (value: McpResponse) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// Generate silent WAV on module load
const silenceWavPath = ensureSilenceWav();

// Kept under 60s on purpose: that is the MCP SDK's own client-side default, so
// a 60s server timeout races the client and the user gets a generic client
// abort instead of our partial results and warnings.
const DEFAULT_LIVE_API_CALL_TIMEOUT_MS = 45_000;

// Map to store pending requests and their resolve functions
const pendingRequests = new Map<string, PendingRequest>();

let timeoutMs = DEFAULT_LIVE_API_CALL_TIMEOUT_MS;

Max.addHandler("timeoutMs", (input: unknown) => {
  const n = Number(input);

  if (n > 0 && n <= 60_000) {
    timeoutMs = n;
  } else {
    console.error(`Invalid Live API timeoutMs: ${String(input)}`);
  }
});

/**
 * Send a tool call to the Max v8 environment
 *
 * @param tool - Tool name to call
 * @param args - Arguments for the tool
 * @param overrides - Optional per-request context overrides (e.g. used by the
 *   REST `?format=` and `?timeoutMs=` query params)
 * @returns Tool execution result
 */
function callLiveApi(
  tool: string,
  args: object,
  overrides?: RequestOverrides,
): Promise<McpResponse> {
  const argsJSON = JSON.stringify(args);
  const effectiveTimeoutMs = overrides?.timeoutMs ?? timeoutMs;
  const contextJSON = JSON.stringify({
    timeoutMs,
    ...overrides,
    silenceWavPath,
  });
  const requestId = crypto.randomUUID();

  console.info(
    `Handling tool call: ${tool}(${argsJSON}) [requestId=${requestId}]`,
  );

  // Return a promise that will be resolved when Max responds or timeout
  return new Promise((resolve) => {
    // Send the request to Max as JSON (with context)
    // If outlet fails, resolve immediately with error (don't wait for timeout)
    Max.outlet("mcp_request", requestId, tool, argsJSON, contextJSON).catch(
      (error: unknown) => {
        const pending = pendingRequests.get(requestId);

        if (pending) {
          clearTimeout(pending.timeout);
          pendingRequests.delete(requestId);
        }

        const msg = errorMessage(error);

        resolve(
          formatErrorResponse(
            msg.length > 0
              ? msg
              : `Error sending message to ${tool}: ${String(error)}`,
          ),
        );
      },
    );

    pendingRequests.set(requestId, {
      resolve,
      timeout: setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          // Always resolve (not reject) with the standard error format.
          // Tag with the "timeout" discriminator so the REST route can map it
          // to HTTP 504 (other formatErrorResponse calls stay untagged).
          // The message must not read as "nothing happened": V8 runs the tool
          // synchronously with no cancellation channel, so the Set is likely
          // still being mutated as this resolves.
          resolve(
            formatErrorResponse(
              `Tool call '${tool}' timed out after ${effectiveTimeoutMs}ms. ` +
                `Live may still be applying it — wait, then re-read before acting.`,
              "timeout",
            ),
          );
        }
      }, effectiveTimeoutMs),
    });
  });
}

/**
 * Handle Live API result from Max
 *
 * @param args - Request ID followed by response parameters (chunks and errors)
 */
function handleLiveApiResult(...args: unknown[]): void {
  const [requestId, ...params] = args as [string, ...unknown[]];

  console.info(`mcp_response(requestId=${requestId}, params=${params.length})`);

  const pendingRequest = pendingRequests.get(requestId);
  const resolve = pendingRequest?.resolve;

  if (pendingRequest) {
    clearTimeout(pendingRequest.timeout);
    pendingRequests.delete(requestId);
  }

  if (resolve) {
    try {
      // Find the delimiter
      const delimiterIndex = params.indexOf(MAX_ERROR_DELIMITER);

      if (delimiterIndex === -1) {
        throw new Error("Missing MAX_ERROR_DELIMITER in response");
      }

      // Split chunks and errors
      const chunks = params.slice(0, delimiterIndex);
      const maxErrors = params.slice(delimiterIndex + 1);

      // Reassemble chunks
      const resultJSON = chunks.join("");
      const result = JSON.parse(resultJSON) as McpResponse;

      const resultLength = result.content.reduce(
        (sum: number, { text }: { text: string }) => sum + text.length,
        0,
      );
      let errorMessageLength = 0;

      // Add any Max errors as warnings, collapsing repeats. A tool that loops
      // over N clips re-runs the same interpretation N times, so one bad note
      // relays N identical warnings; the copies cost the model context without
      // telling it anything the count doesn't.
      const warningCounts = new Map<string, number>();

      for (const err of maxErrors) {
        let msg = String(err);

        // Remove v8: prefix and trim whitespace
        if (msg.startsWith("v8:")) {
          msg = msg.slice(3).trim();
        }

        // Only add if there's actual content after cleaning
        if (msg.length > 0) {
          warningCounts.set(msg, (warningCounts.get(msg) ?? 0) + 1);
        }
      }

      for (const [msg, count] of warningCounts) {
        const repeats = count > 1 ? ` (x${count})` : "";
        const errorText = `${WARNING_PREFIX}${msg}${repeats}`;

        result.content.push({ type: "text", text: errorText });
        errorMessageLength += errorText.length;
      }

      console.info(
        `Tool call result metrics: ${JSON.stringify({
          resultLength,
          errorCount: maxErrors.length,
          errorMessageLength,
        })}`,
      );

      resolve(result);
    } catch (error) {
      resolve(
        formatErrorResponse(
          `Error parsing tool result from Max: ${String(error)}`,
        ),
      );
    }
  } else {
    console.info(`Received response for unknown request ID: ${requestId}`);
  }
}

Max.addHandler("mcp_response", handleLiveApiResult);

// Handler for code execution requests from V8
Max.addHandler("code_exec_request", (...args: unknown[]) => {
  const [requestId, requestJson] = args as [string, string];

  handleCodeExecRequest(requestId, requestJson).catch((error) => {
    console.error(`Error handling code_exec_request: ${String(error)}`);
  });
});

// Handler for generic node_request RPC calls from V8
Max.addHandler("node_request", (...args: unknown[]) => {
  const [requestId, requestJson] = args as [string, string];

  handleNodeRequest(requestId, requestJson).catch((error) => {
    console.error(`Error handling node_request: ${String(error)}`);
  });
});

/**
 * Set the timeout for testing purposes
 *
 * @param ms - Timeout in milliseconds
 */
export function setTimeoutForTesting(ms: number): void {
  timeoutMs = ms;
}

// Export individual functions for testing
export { callLiveApi, handleLiveApiResult };
