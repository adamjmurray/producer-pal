// Adapter for communication between Node.js MCP server and Max v8 environment

import crypto from "node:crypto";
import Max from "max-api";
import { errorMessage } from "#src/shared/error-utils.ts";
import {
  formatErrorResponse,
  MAX_ERROR_DELIMITER,
} from "#src/shared/mcp-response-utils.ts";
import { ensureSilenceWav } from "#src/shared/silent-wav-generator.ts";
import {
  completeCodeExecRequest,
  handleNotesData,
  registerCodeExecRequest,
} from "./code-exec-protocol.ts";
import * as console from "./node-for-max-logger.ts";

interface McpResponseContent {
  type: string;
  text: string;
}

interface McpResponse {
  content: McpResponseContent[];
  isError?: boolean;
}

interface PendingRequest {
  resolve: (value: McpResponse) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// Generate silent WAV on module load
const silenceWavPath = ensureSilenceWav();

const DEFAULT_LIVE_API_CALL_TIMEOUT_MS = 30_000;

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
 * @returns Tool execution result
 */
function callLiveApi(tool: string, args: object): Promise<McpResponse> {
  const argsJSON = JSON.stringify(args);
  const contextJSON = JSON.stringify({ silenceWavPath });
  const requestId = crypto.randomUUID();

  // Check if this is a code execution request
  const argsWithCode = args as { code?: string };
  const hasCodeExec = typeof argsWithCode.code === "string";

  console.info(
    `Handling tool call: ${tool}(${argsJSON}) [requestId=${requestId}]${hasCodeExec ? " [code-exec]" : ""}`,
  );

  // Return a promise that will be resolved when Max responds or timeout
  return new Promise((resolve) => {
    // For code execution, register with the protocol handler
    // The resolve will be called after the full notes_data -> apply_notes flow
    if (hasCodeExec) {
      registerCodeExecRequest(requestId, argsWithCode.code as string, resolve);
    }

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
          ) as McpResponse,
        );
      },
    );

    pendingRequests.set(requestId, {
      resolve,
      timeout: setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          // Always resolve (not reject) with the standard error format
          resolve(
            formatErrorResponse(
              `Tool call '${tool}' timed out after ${timeoutMs}ms`,
            ) as McpResponse,
          );
        }
      }, timeoutMs),
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

  // Check for code execution request first
  const codeExecState = completeCodeExecRequest(requestId);

  // Get the regular pending request
  const pendingRequest = pendingRequests.get(requestId);

  // Use code exec resolve if available, otherwise use regular pending request
  const resolve = codeExecState?.resolve ?? pendingRequest?.resolve;

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

      // Add any Max errors as warnings
      for (const err of maxErrors) {
        let msg = String(err);

        // Remove v8: prefix and trim whitespace
        if (msg.startsWith("v8:")) {
          msg = msg.slice(3).trim();
        }

        // Only add if there's actual content after cleaning
        if (msg.length > 0) {
          const errorText = `WARNING: ${msg}`;

          result.content.push({ type: "text", text: errorText });
          errorMessageLength += errorText.length;
        }
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
        ) as McpResponse,
      );
    }
  } else {
    console.info(`Received response for unknown request ID: ${requestId}`);
  }
}

Max.addHandler("mcp_response", handleLiveApiResult);

// Handler for notes_data messages from V8 during code execution
Max.addHandler("notes_data", (...args: unknown[]) => {
  const [requestId, notesDataJson] = args as [string, string];

  console.info(`notes_data(requestId=${requestId})`);
  handleNotesData(requestId, notesDataJson).catch((error) => {
    console.error(`Error handling notes_data: ${String(error)}`);
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
