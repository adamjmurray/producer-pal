// src/mcp-server/create-express-app.js
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import Max from "max-api";
import crypto from "node:crypto";
import { formatErrorResponse } from "../mcp-response-utils.js";
import { createMcpServer } from "./create-mcp-server";
import * as console from "./node-for-max-logger";

export const DEFAULT_LIVE_API_CALL_TIMEOUT_MS = 15_000;

// Map to store pending requests and their resolve functions
const pendingRequests = new Map();

// Function to send a tool call to the Max v8 environment
function callLiveApi(
  toolName,
  args,
  timeoutMs = DEFAULT_LIVE_API_CALL_TIMEOUT_MS,
) {
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

const methodNotAllowed = {
  jsonrpc: "2.0",
  error: {
    code: ErrorCode.ConnectionClosed,
    message: "Method not allowed.",
  },
  id: null,
};

const internalError = (message) => ({
  jsonrpc: "2.0",
  error: {
    code: ErrorCode.InternalError,
    message: `Internal server error: ${message}`,
  },
  id: null,
});

export function createExpressApp(options = {}) {
  const { timeoutMs = DEFAULT_LIVE_API_CALL_TIMEOUT_MS } = options;

  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    try {
      console.info("New MCP connection: " + JSON.stringify(req.body));

      const callLiveApiWithTimeout = (toolName, args) =>
        callLiveApi(toolName, args, timeoutMs);
      const server = createMcpServer(callLiveApiWithTimeout);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless mode
      });

      res.on("close", () => {
        transport.close();
        server.close();
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error(`Error handling MCP request: ${error}`);
      res.status(500).json(internalError(error.message));
    }
  });

  // Because we're using a stateless server, these standard streamable HTTP transport methods are not allowed:
  app.get("/mcp", async (_req, res) => res.status(405).json(methodNotAllowed));
  app.delete("/mcp", async (_req, res) =>
    res.status(405).json(methodNotAllowed),
  );

  Max.addHandler("mcp_response", handleLiveApiResult);

  return app;
}

export { callLiveApi, handleLiveApiResult };
