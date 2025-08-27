// Adapter for communication between Node.js MCP server and Max v8 environment

import Max from "max-api";
import crypto from "node:crypto";
import {
  formatErrorResponse,
  MAX_ERROR_DELIMITER,
} from "../mcp-response-utils.js";
import * as console from "./node-for-max-logger.js";

export const DEFAULT_LIVE_API_CALL_TIMEOUT_MS = 30_000;

// Map to store pending requests and their resolve functions
const pendingRequests = new Map();

let timeoutMs = DEFAULT_LIVE_API_CALL_TIMEOUT_MS;
Max.addHandler("timeoutMs", (input) => {
  const n = Number(input);
  if (n > 0 && n <= 60_000) {
    timeoutMs = n;
  } else {
    console.error(`Invalid Live API timeoutMs: ${input}`);
  }
});

// Function to send a tool call to the Max v8 environment
function callLiveApi(tool, args) {
  const argsJSON = JSON.stringify(args);
  const requestId = crypto.randomUUID();

  console.info(
    `Handling tool call: ${tool}(${argsJSON}) [requestId=${requestId}]`,
  );

  // Return a promise that will be resolved when Max responds or timeout
  return new Promise((resolve) => {
    try {
      // Send the request to Max as JSON
      Max.outlet("mcp_request", requestId, tool, argsJSON);
    } catch (error) {
      // Always resolve (not reject) with the standard error format
      return resolve(
        formatErrorResponse(
          error.message || `Error sending message to ${tool}: ${error}`,
        ),
      );
    }
    pendingRequests.set(requestId, {
      resolve,
      timeout: setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          // Always resolve (not reject) with the standard error format
          resolve(
            formatErrorResponse(
              `Tool call '${tool}' timed out after ${timeoutMs}ms`,
            ),
          );
        }
      }, timeoutMs),
    });
  });
}

function handleLiveApiResult(requestId, ...params) {
  console.info(`mcp_response(requestId=${requestId}, params=${params.length})`);

  if (pendingRequests.has(requestId)) {
    const { resolve, timeout } = pendingRequests.get(requestId);
    pendingRequests.delete(requestId);
    if (timeout) {
      clearTimeout(timeout);
    }

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
      const result = JSON.parse(resultJSON);

      // Add any Max errors as warnings
      for (const error of maxErrors) {
        result.content.push({ type: "text", text: `WARNING: ${error}` });
      }

      resolve(result);
    } catch (error) {
      resolve(
        formatErrorResponse(`Error parsing tool result from Max: ${error}`),
      );
    }
  } else {
    console.info(`Received response for unknown request ID: ${requestId}`);
  }
}

Max.addHandler("mcp_response", handleLiveApiResult);

// Test helper function to control timeout in tests
export function setTimeoutForTesting(ms) {
  timeoutMs = ms;
}

// Export individual functions for testing
export { callLiveApi, handleLiveApiResult };
