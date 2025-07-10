// src/mcp-server/create-mcp-server.js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "../version.js";
import { addToolCaptureScene } from "./add-tool-capture-scene.js";
import { addToolCreateClip } from "./add-tool-create-clip.js";
import { addToolCreateScene } from "./add-tool-create-scene.js";
import { addToolCreateTrack } from "./add-tool-create-track.js";
import { addToolDelete } from "./add-tool-delete.js";
import { addToolDuplicate } from "./add-tool-duplicate.js";
import { addToolMemory } from "./add-tool-memory.js";
import { addToolRawLiveApi } from "./add-tool-raw-live-api.js";
import { addToolReadClip } from "./add-tool-read-clip.js";
import { addToolReadScene } from "./add-tool-read-scene.js";
import { addToolReadSong } from "./add-tool-read-song.js";
import { addToolReadTrack } from "./add-tool-read-track.js";
import { addToolTransport } from "./add-tool-transport.js";
import { addToolUpdateClip } from "./add-tool-update-clip.js";
import { addToolUpdateScene } from "./add-tool-update-scene.js";
import { addToolUpdateSong } from "./add-tool-update-song.js";
import { addToolUpdateTrack } from "./add-tool-update-track.js";

export function createMcpServer(callLiveApi) {
  const server = new McpServer({
    name: "Ableton Live Producer Pal: AI tools for producing music in Ableton Live",
    version: VERSION,
  });

  addToolCreateClip(server, callLiveApi);
  addToolReadClip(server, callLiveApi);
  addToolUpdateClip(server, callLiveApi);

  addToolCreateTrack(server, callLiveApi);
  addToolReadTrack(server, callLiveApi);
  addToolUpdateTrack(server, callLiveApi);

  addToolCaptureScene(server, callLiveApi);
  addToolCreateScene(server, callLiveApi);
  addToolReadScene(server, callLiveApi);
  addToolUpdateScene(server, callLiveApi);

  addToolReadSong(server, callLiveApi);
  addToolUpdateSong(server, callLiveApi);

  addToolTransport(server, callLiveApi);
  addToolDelete(server, callLiveApi);
  addToolDuplicate(server, callLiveApi);
  addToolMemory(server, callLiveApi);

  if (process.env.ENABLE_RAW_LIVE_API === "true") {
    addToolRawLiveApi(server, callLiveApi);
  }

  return server;
}
