// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Adapter for communication between Node.js MCP server and Max v8 environment

import crypto from "node:crypto";
import Max from "max-api";
import { errorMessage } from "#src/shared/error-message.ts";
import {
  formatErrorResponse,
  oversizedSingleMessageError,
  reassembleChunks,
  WARNING_PREFIX,
  type McpErrorCode,
} from "#src/shared/mcp-responses.ts";
import { MAX_TIMEOUT_MS } from "#src/shared/config.ts";
import { ensureSilenceWav } from "#src/shared/silent-wav-generator.ts";
import { markChangedNothing } from "./rpc/remote-script/forwarded/changed-nothing.ts";
import { handleCodeExecRequest } from "./code-exec-protocol.ts";
import { type RequestOverrides } from "./helpers/request-overrides/request-overrides.ts";
import { withWriteQueue } from "./rpc/write-queue/write-queue.ts";
import * as console from "./node-for-max-logger.ts";
import { handleNodeRequest } from "./rpc/node-request-protocol.ts";

// Re-export for convenience so existing consumers can keep importing from here
export { type RequestOverrides } from "./helpers/request-overrides/request-overrides.ts";

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
  /**
   * Warnings V8 raised while handling the request. Consumed and deleted in
   * handleLiveApiResult, where they become WARNING: content items, so it never
   * reaches the SDK.
   */
  warnings?: string[];
}

/** What V8 sends: a response, plus sidecars Node consumes. */
interface WireResponse extends McpResponse {
  /** V8 proved the call changed nothing in the Set; see changed-nothing.ts */
  changedNothing?: boolean;
}

interface PendingRequest {
  resolve: (value: McpResponse) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// Generate silent WAV on module load
const silenceWavPath = ensureSilenceWav();

// Under MAX_TIMEOUT_MS, which is itself under the MCP SDK's client-side
// default — see MAX_TIMEOUT_MS for why that matters.
const DEFAULT_LIVE_API_CALL_TIMEOUT_MS = 45_000;

// Map to store pending requests and their resolve functions
const pendingRequests = new Map<string, PendingRequest>();

let timeoutMs = DEFAULT_LIVE_API_CALL_TIMEOUT_MS;

Max.addHandler("timeoutMs", (input: unknown) => {
  const n = Number(input);

  if (!(n > 0)) {
    console.error(`Invalid Live API timeoutMs: ${String(input)}`);

    return;
  }

  // Clamp rather than discard: dropping the value left the old timeout in
  // place with nothing the user could see to explain it.
  if (n > MAX_TIMEOUT_MS) {
    console.warn(`Live API timeoutMs ${n} capped at ${MAX_TIMEOUT_MS}`);
  }

  timeoutMs = Math.min(n, MAX_TIMEOUT_MS);
});

/**
 * Send a tool call to the Max v8 environment
 *
 * @param tool - Tool name to call
 * @param args - Arguments for the tool
 * @param overrides - Optional per-request context overrides (e.g. used by the
 *   REST `?format=` and `?timeoutMs=` query params)
 * @param queuedMs - Time the call already spent in the write queue, out of its
 *   timeout
 * @returns Tool execution result
 */
function sendToolCall(
  tool: string,
  args: object,
  overrides?: RequestOverrides,
  queuedMs = 0,
): Promise<McpResponse> {
  const argsJSON = JSON.stringify(args);
  const effectiveTimeoutMs = overrides?.timeoutMs ?? timeoutMs;
  const remainingMs = effectiveTimeoutMs - queuedMs;
  const contextJSON = JSON.stringify({
    timeoutMs,
    ...overrides,
    // V8 sets its deadline from this, so it gets only what is left.
    ...(queuedMs > 0 && { timeoutMs: remainingMs }),
    silenceWavPath,
  });
  const queuedText =
    queuedMs > 0 ? ` (${queuedMs}ms of it waiting for other writes)` : "";
  const requestId = crypto.randomUUID();

  // mcp_request isn't chunked, and Max would cut a long atom short.
  const advice = "Not run. Send less in one call. Nothing changed.";
  const tooLarge =
    oversizedSingleMessageError(argsJSON, `Tool call '${tool}' args`, advice) ??
    oversizedSingleMessageError(
      contextJSON,
      `Tool call '${tool}' context`,
      advice,
    );

  if (tooLarge != null) {
    const response = formatErrorResponse(tooLarge);

    markChangedNothing(response);

    return Promise.resolve(response);
  }

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
      // Every other path clears this timer first, so a request is still pending.
      timeout: setTimeout(() => {
        pendingRequests.delete(requestId);
        // Resolve, never reject, and tag it "timeout" so the REST route maps
        // it to HTTP 504. The message must not read as "nothing happened": V8
        // runs the tool synchronously with no cancellation channel, so the Set
        // is likely still being mutated as this resolves.
        resolve(
          formatErrorResponse(
            `Tool call '${tool}' timed out after ${effectiveTimeoutMs}ms${queuedText}. ` +
              `Live may still be applying it — wait, then re-read before acting.`,
            "timeout",
          ),
        );
      }, remainingMs),
    });
  });
}

/**
 * Every tool call into V8 goes through here, MCP and REST alike. Write calls
 * run one at a time (see write-queue.ts).
 */
const callLiveApi = withWriteQueue(sendToolCall, () => timeoutMs);

/**
 * Handle Live API result from Max
 *
 * @param args - Request ID followed by the payload chunks and END_OF_CHUNKS
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
      const result = JSON.parse(reassembleChunks(params)) as WireResponse;
      const warnings = result.warnings ?? [];

      delete result.warnings;

      if (result.changedNothing === true) {
        markChangedNothing(result);
      }

      delete result.changedNothing;

      const resultLength = result.content.reduce(
        (sum: number, { text }: { text: string }) => sum + text.length,
        0,
      );
      const warningTextLength = appendWarnings(result, warnings);

      console.info(
        `Tool call result metrics: ${JSON.stringify({
          resultLength,
          warningCount: warnings.length,
          warningTextLength,
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

/**
 * Push warnings onto the response as WARNING: content items, collapsing
 * repeats. A tool that loops over N clips re-runs the same interpretation N
 * times, so one bad note relays N identical warnings; the copies cost the model
 * context without telling it anything the count doesn't.
 *
 * @param result - Response to append to, mutated in place
 * @param warnings - Warning messages in the order V8 raised them
 * @returns Total length of the appended text, for the metrics log
 */
function appendWarnings(result: McpResponse, warnings: string[]): number {
  const counts = new Map<string, number>();

  for (const warning of warnings) {
    if (warning.length > 0) {
      counts.set(warning, (counts.get(warning) ?? 0) + 1);
    }
  }

  let textLength = 0;

  for (const [msg, count] of counts) {
    const repeats = count > 1 ? ` (x${count})` : "";
    const text = `${WARNING_PREFIX}${msg}${repeats}`;

    result.content.push({ type: "text", text });
    textLength += text.length;
  }

  return textLength;
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
