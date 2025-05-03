// device/server/create-mpc-server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateClipTool } from "./tools/register-create-clip-tool.ts";

export function createMcpServer(pendingRequests: Map<string, Function>) {
  const server = new McpServer({
    name: "live-composition-assistant",
    version: "1.0.0",
  });

  registerCreateClipTool(server, pendingRequests);

  return server;
}
