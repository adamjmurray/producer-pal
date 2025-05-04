// device/mcp-server/add-tool-list-tracks-tool.ts
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callLiveApi } from "./call-live-api.ts";

export function addToolListTracks(server: McpServer, pendingRequests: Map<string, Function>) {
  server.tool("list-tracks", "Lists all tracks and their clips in the Live session view", {}, async () =>
    callLiveApi("list-tracks", {}, pendingRequests)
  );
}
