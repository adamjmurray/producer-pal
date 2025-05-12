// device/mcp-server/create-mpc-server.mjs (updated)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addToolDeleteClip } from "./add-tool-delete-clip.mjs";
import { addToolDeleteScene } from "./add-tool-delete-scene.mjs";
import { addToolDeleteTrack } from "./add-tool-delete-track.mjs";
import { addToolReadClip } from "./add-tool-read-clip.mjs";
import { addToolReadLiveSet } from "./add-tool-read-live-set.mjs";
import { addToolReadScene } from "./add-tool-read-scene.mjs";
import { addToolReadTrack } from "./add-tool-read-track.mjs";
import { addToolWriteClip } from "./add-tool-write-clip.mjs";
import { addToolWriteLiveSet } from "./add-tool-write-live-set.mjs";
import { addToolWriteScene } from "./add-tool-write-scene.mjs";
import { addToolWriteTrack } from "./add-tool-write-track.mjs";

export function createMcpServer(callLiveApi) {
  const server = new McpServer({
    name: "Ableton Live Composition Assistant",
    version: "1.0.0",
  });

  addToolReadLiveSet(server, callLiveApi);
  addToolWriteLiveSet(server, callLiveApi);

  addToolReadTrack(server, callLiveApi);
  addToolWriteTrack(server, callLiveApi);
  addToolDeleteTrack(server, callLiveApi);

  addToolReadScene(server, callLiveApi);
  addToolWriteScene(server, callLiveApi);
  addToolDeleteScene(server, callLiveApi);

  addToolReadClip(server, callLiveApi);
  addToolWriteClip(server, callLiveApi);
  addToolDeleteClip(server, callLiveApi);

  return server;
}
