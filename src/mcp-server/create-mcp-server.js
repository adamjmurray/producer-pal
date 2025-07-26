// src/mcp-server/create-mcp-server.js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "../version.js";
import { toolDefCaptureScene } from "./tool-def-capture-scene.js";
import { toolDefCreateClip } from "./tool-def-create-clip.js";
import { toolDefCreateScene } from "./tool-def-create-scene.js";
import { toolDefCreateTrack } from "./tool-def-create-track.js";
import { toolDefDelete } from "./tool-def-delete.js";
import { toolDefDuplicate } from "./tool-def-duplicate.js";
import { toolDefInit } from "./tool-def-init.js";
import { toolDefMemory } from "./tool-def-memory.js";
import { toolDefRawLiveApi } from "./tool-def-raw-live-api.js";
import { toolDefReadClip } from "./tool-def-read-clip.js";
import { toolDefReadScene } from "./tool-def-read-scene.js";
import { toolDefReadSong } from "./tool-def-read-song.js";
import { toolDefReadTrack } from "./tool-def-read-track.js";
import { toolDefReadView } from "./tool-def-read-view.js";
import { toolDefTransport } from "./tool-def-transport.js";
import { toolDefUpdateClip } from "./tool-def-update-clip.js";
import { toolDefUpdateView } from "./tool-def-update-view.js";
import { toolDefUpdateScene } from "./tool-def-update-scene.js";
import { toolDefUpdateSong } from "./tool-def-update-song.js";
import { toolDefUpdateTrack } from "./tool-def-update-track.js";

export function createMcpServer(callLiveApi) {
  const server = new McpServer({
    name: "Ableton Live Producer Pal: AI tools for producing music in Ableton Live",
    version: VERSION,
  });

  const addTool = (toolDef) => toolDef(server, callLiveApi);

  addTool(toolDefInit);

  addTool(toolDefReadSong);
  addTool(toolDefUpdateSong);

  addTool(toolDefReadView);
  addTool(toolDefUpdateView);

  addTool(toolDefCreateTrack);
  addTool(toolDefReadTrack);
  addTool(toolDefUpdateTrack);

  addTool(toolDefCaptureScene);
  addTool(toolDefCreateScene);
  addTool(toolDefReadScene);
  addTool(toolDefUpdateScene);

  addTool(toolDefCreateClip);
  addTool(toolDefReadClip);
  addTool(toolDefUpdateClip);

  addTool(toolDefTransport);
  addTool(toolDefDelete);
  addTool(toolDefDuplicate);
  addTool(toolDefMemory);

  if (process.env.ENABLE_RAW_LIVE_API === "true") {
    addTool(toolDefRawLiveApi);
  }

  return server;
}
