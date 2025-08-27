import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "../shared/version.js";
import { toolDefCreateClip } from "../tools/clip/create-clip.def.js";
import { toolDefReadClip } from "../tools/clip/read-clip.def.js";
import { toolDefUpdateClip } from "../tools/clip/update-clip.def.js";
import { toolDefReadDevice } from "../tools/device/read-device.def.js";
import { toolDefDelete } from "../tools/operations/delete.def.js";
import { toolDefDuplicate } from "../tools/operations/duplicate.def.js";
import { toolDefInit } from "../tools/operations/init.def.js";
import { toolDefMemory } from "../tools/operations/memory.def.js";
import { toolDefRawLiveApi } from "../tools/operations/raw-live-api.def.js";
import { toolDefTransport } from "../tools/operations/transport.def.js";
import { toolDefCaptureScene } from "../tools/scene/capture-scene.def.js";
import { toolDefCreateScene } from "../tools/scene/create-scene.def.js";
import { toolDefReadScene } from "../tools/scene/read-scene.def.js";
import { toolDefUpdateScene } from "../tools/scene/update-scene.def.js";
import { toolDefReadSong } from "../tools/song/read-song.def.js";
import { toolDefUpdateSong } from "../tools/song/update-song.def.js";
import { toolDefCreateTrack } from "../tools/track/create-track.def.js";
import { toolDefReadTrack } from "../tools/track/read-track.def.js";
import { toolDefUpdateTrack } from "../tools/track/update-track.def.js";
import { toolDefReadView } from "../tools/view/read-view.def.js";
import { toolDefUpdateView } from "../tools/view/update-view.def.js";

export function createMcpServer(callLiveApi) {
  const server = new McpServer({
    name: "Ableton Live Producer Pal: AI tools for producing music in Ableton Live",
    version: VERSION,
  });

  const addTool = (toolDef) => toolDef(server, callLiveApi);

  addTool(toolDefInit);

  addTool(toolDefReadSong);
  addTool(toolDefUpdateSong);

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

  addTool(toolDefReadDevice);
  addTool(toolDefReadView);
  addTool(toolDefUpdateView);

  addTool(toolDefTransport);
  addTool(toolDefDelete);
  addTool(toolDefDuplicate);
  addTool(toolDefMemory);

  if (process.env.ENABLE_RAW_LIVE_API === "true") {
    addTool(toolDefRawLiveApi);
  }

  return server;
}
