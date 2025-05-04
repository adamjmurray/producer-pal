// device/server/add-tool-list-tracks-tool.ts
import Max from "max-api";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import crypto from "node:crypto";

export function addToolListTracks(server: McpServer, pendingRequests: Map<string, Function>) {
  server.tool("list-tracks", "Lists all tracks and their clips in the Live session view", {}, async () => {
    Max.post("Handling tool call: list-tracks");

    const requestId = crypto.randomUUID();
    const request = {
      requestId,
      tool: "list-tracks",
      args: {},
    };

    Max.outlet("mcp_request", JSON.stringify(request));

    return new Promise((resolve) => {
      pendingRequests.set(requestId, resolve);
    });
  });
}
