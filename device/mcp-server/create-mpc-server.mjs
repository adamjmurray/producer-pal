// device/mcp-server/create-mpc-server.mjs
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addToolCaptureScene } from "./add-tool-capture-scene.mjs";
import { addToolDelete } from "./add-tool-delete.mjs";
import { addToolReadClip } from "./add-tool-read-clip.mjs";
import { addToolReadLiveSet } from "./add-tool-read-live-set.mjs";
import { addToolReadScene } from "./add-tool-read-scene.mjs";
import { addToolReadTrack } from "./add-tool-read-track.mjs";
import { addToolTransport } from "./add-tool-transport.mjs";
import { addToolWriteClip } from "./add-tool-write-clip.mjs";
import { addToolWriteLiveSet } from "./add-tool-write-live-set.mjs";
import { addToolWriteScene } from "./add-tool-write-scene.mjs";
import { addToolWriteTrack } from "./add-tool-write-track.mjs";

import { addToolDuplicate } from "./add-tool-duplicate.mjs";

export function createMcpServer(callLiveApi) {
  const server = new McpServer({
    name: "Ableton Live Composition Assistant",
    version: "1.0.0",
  });

  addToolReadLiveSet(server, callLiveApi);
  addToolWriteLiveSet(server, callLiveApi);

  addToolReadTrack(server, callLiveApi);
  addToolWriteTrack(server, callLiveApi);

  addToolReadScene(server, callLiveApi);
  addToolWriteScene(server, callLiveApi);

  addToolReadClip(server, callLiveApi);
  addToolWriteClip(server, callLiveApi);

  addToolDelete(server, callLiveApi);
  addToolDuplicate(server, callLiveApi);
  addToolCaptureScene(server, callLiveApi);

  addToolTransport(server, callLiveApi);

  return server;
}
