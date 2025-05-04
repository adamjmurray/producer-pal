// device/server/create-mpc-server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addToolCreateClip } from "./add-tool-create-clip.ts";
import { addToolListTracks } from "./add-tool-list-tracks.ts";

export function createMcpServer(pendingRequests: Map<string, Function>) {
  const server = new McpServer({
    name: "live-composition-assistant",
    version: "1.0.0",
  });

  addToolCreateClip(server, pendingRequests);
  addToolListTracks(server, pendingRequests);

  return server;
}
