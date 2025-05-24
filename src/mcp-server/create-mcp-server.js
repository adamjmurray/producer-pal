// src/mcp-server/create-mcp-server.js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addToolCaptureScene } from "./add-tool-capture-scene";
import { addToolCreateTrack } from "./add-tool-create-track";
import { addToolDelete } from "./add-tool-delete";
import { addToolReadClip } from "./add-tool-read-clip";
import { addToolReadScene } from "./add-tool-read-scene";
import { addToolReadSong } from "./add-tool-read-song";
import { addToolReadTrack } from "./add-tool-read-track";
import { addToolTransport } from "./add-tool-transport";
import { addToolUpdateTrack } from "./add-tool-update-track";
import { addToolWriteClip } from "./add-tool-write-clip";
import { addToolWriteScene } from "./add-tool-write-scene";
import { addToolWriteSong } from "./add-tool-write-song";

import { addToolDuplicate } from "./add-tool-duplicate";

export function createMcpServer(callLiveApi) {
  const server = new McpServer({
    name: "Ableton Live Composition Assistant",
    version: "1.0.0",
  });

  addToolReadSong(server, callLiveApi);
  addToolWriteSong(server, callLiveApi);

  addToolReadScene(server, callLiveApi);
  addToolWriteScene(server, callLiveApi);

  addToolCreateTrack(server, callLiveApi);
  addToolReadTrack(server, callLiveApi);
  addToolUpdateTrack(server, callLiveApi);

  addToolReadClip(server, callLiveApi);
  addToolWriteClip(server, callLiveApi);

  addToolDelete(server, callLiveApi);
  addToolDuplicate(server, callLiveApi);
  addToolCaptureScene(server, callLiveApi);

  addToolTransport(server, callLiveApi);

  return server;
}
