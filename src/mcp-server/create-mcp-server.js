// src/mcp-server/create-mcp-server.js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addToolCaptureScene } from "./add-tool-capture-scene";
import { addToolCreateScene } from "./add-tool-create-scene";
import { addToolCreateTrack } from "./add-tool-create-track";
import { addToolDelete } from "./add-tool-delete";
import { addToolDuplicate } from "./add-tool-duplicate";
import { addToolReadClip } from "./add-tool-read-clip";
import { addToolReadScene } from "./add-tool-read-scene";
import { addToolReadSong } from "./add-tool-read-song";
import { addToolReadTrack } from "./add-tool-read-track";
import { addToolTransport } from "./add-tool-transport";
import { addToolUpdateScene } from "./add-tool-update-scene";
import { addToolUpdateSong } from "./add-tool-update-song";
import { addToolUpdateTrack } from "./add-tool-update-track";
import { addToolWriteClip } from "./add-tool-write-clip";

export function createMcpServer(callLiveApi) {
  const server = new McpServer({
    name: "Ableton Live Composition Assistant",
    version: "1.0.0",
  });

  addToolTransport(server, callLiveApi);

  addToolReadSong(server, callLiveApi);
  addToolUpdateSong(server, callLiveApi);

  addToolCaptureScene(server, callLiveApi);
  addToolCreateScene(server, callLiveApi);
  addToolReadScene(server, callLiveApi);
  addToolUpdateScene(server, callLiveApi);

  addToolCreateTrack(server, callLiveApi);
  addToolReadTrack(server, callLiveApi);
  addToolUpdateTrack(server, callLiveApi);

  addToolReadClip(server, callLiveApi);
  addToolWriteClip(server, callLiveApi);

  addToolDelete(server, callLiveApi);
  addToolDuplicate(server, callLiveApi);

  return server;
}
