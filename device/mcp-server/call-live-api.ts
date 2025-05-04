// device/mcp-server/call-live-api.ts
import Max from "max-api";
import crypto from "node:crypto";

/**
 * Sends a tool call to the Max v8 environment and returns a promise that resolves when Max responds
 */
export function callLiveApi(
  toolName: string,
  args: Record<string, any>,
  pendingRequests: Map<string, Function>
): Promise<any> {
  Max.post(`Handling tool call: ${toolName}(${JSON.stringify(args)})`);

  // Create a request with a unique ID
  const requestId = crypto.randomUUID();
  const request = {
    requestId,
    tool: toolName,
    args,
  };

  // Send the request to Max as JSON
  Max.outlet("mcp_request", JSON.stringify(request));

  // Return a promise that will be resolved when Max responds
  return new Promise<any>((resolve) => {
    pendingRequests.set(requestId, resolve);
  });
}
