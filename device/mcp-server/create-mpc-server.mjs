// device/mcp-server/create-mpc-server.mjs
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addToolDeleteClip } from "./add-tool-delete-clip.mjs";
import { addToolDeleteTrack } from "./add-tool-delete-track.mjs";
import { addToolReadClip } from "./add-tool-read-clip.mjs";
import { addToolReadLiveSet } from "./add-tool-read-live-set.mjs";
import { addToolReadTrack } from "./add-tool-read-track.mjs";
import { addToolWriteClip } from "./add-tool-write-clip.mjs";
import { addToolWriteTrack } from "./add-tool-write-track.mjs";

export function createMcpServer(pendingRequests) {
  const server = new McpServer({
    name: "Ableton Live Composition Assistant",
    version: "1.0.0",
  });

  addToolReadLiveSet(server, pendingRequests);

  addToolReadTrack(server, pendingRequests);
  addToolWriteTrack(server, pendingRequests);
  addToolDeleteTrack(server, pendingRequests);

  addToolReadClip(server, pendingRequests);
  addToolWriteClip(server, pendingRequests);
  addToolDeleteClip(server, pendingRequests);

  return server;
}
