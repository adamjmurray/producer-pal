// src/mcp-server/max-api-adapter.js
// Adapter for communication between Node.js MCP server and Max v8 environment

import Max from "max-api";
import crypto from "node:crypto";
import { formatErrorResponse } from "../mcp-response-utils.js";
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
function callLiveApi(toolName, args) {
  console.info(`Handling tool call: ${toolName}(${JSON.stringify(args)})`);

  // Create a request with a unique ID
  const requestId = crypto.randomUUID();
  const request = {
    requestId,
    tool: toolName,
    args,
  };

  // Return a promise that will be resolved when Max responds or timeout
  return new Promise((resolve) => {
    try {
      // Send the request to Max as JSON
      Max.outlet("mcp_request", JSON.stringify(request));
    } catch (error) {
      // Always resolve (not reject) with the standard error format
      return resolve(
        formatErrorResponse(
          error.message || `Error sending message to ${toolName}: ${error}`,
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
              `Tool call '${toolName}' timed out after ${timeoutMs}ms`,
            ),
          );
        }
      }, timeoutMs),
    });
  });
}

function handleLiveApiResult(responseJson, ...maxErrors) {
  console.info(
    `mcp_response(${responseJson}, maxErrors=[${maxErrors.join(", ")}])`,
  );
  try {
    const response = JSON.parse(responseJson);
    const { requestId, result } = response;

    if (pendingRequests.has(requestId)) {
      const { resolve, timeout } = pendingRequests.get(requestId);
      pendingRequests.delete(requestId);
      if (timeout) {
        clearTimeout(timeout);
      }
      for (const error of maxErrors) {
        result.content.push({ type: "text", text: `WARNING: ${error}` });
      }
      resolve(result);
    } else {
      console.info(`Received response for unknown request ID: ${requestId}`);
    }
  } catch (error) {
    console.error(`Error handling response from Max: ${error}`);
  }
}

Max.addHandler("mcp_response", handleLiveApiResult);

// Test helper function to control timeout in tests
export function setTimeoutForTesting(ms) {
  timeoutMs = ms;
}

// Export individual functions for testing
export { callLiveApi, handleLiveApiResult };
