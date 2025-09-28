import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "../shared/version.js";
import { toolDefCreateClip } from "../tools/clip/create-clip.def.js";
import { toolDefReadClip } from "../tools/clip/read-clip.def.js";
import { toolDefUpdateClip } from "../tools/clip/update-clip.def.js";
// import { toolDefReadDevice } from "./tool-def-read-device.js";  // UNUSED - see read-device.js for why
import { toolDefPlayback } from "../tools/control/playback.def.js";
import { toolDefRawLiveApi } from "../tools/control/raw-live-api.def.js";
import { toolDefSelect } from "../tools/control/select.def.js";
import { toolDefReadLiveSet } from "../tools/live-set/read-live-set.def.js";
import { toolDefUpdateLiveSet } from "../tools/live-set/update-live-set.def.js";
import { toolDefDelete } from "../tools/operations/delete.def.js";
import { toolDefDuplicate } from "../tools/operations/duplicate.def.js";
import { toolDefCreateScene } from "../tools/scene/create-scene.def.js";
import { toolDefReadScene } from "../tools/scene/read-scene.def.js";
import { toolDefUpdateScene } from "../tools/scene/update-scene.def.js";
import { toolDefCreateTrack } from "../tools/track/create-track.def.js";
import { toolDefReadTrack } from "../tools/track/read-track.def.js";
import { toolDefUpdateTrack } from "../tools/track/update-track.def.js";
import { toolDefConnect } from "../tools/workflow/connect.def.js";
import { toolDefMemory } from "../tools/workflow/memory.def.js";

export function createMcpServer(callLiveApi) {
  const server = new McpServer({
    name: "Ableton Live Producer Pal: AI tools for producing music in Ableton Live",
    version: VERSION,
  });

  const addTool = (toolDef) => toolDef(server, callLiveApi);

  addTool(toolDefConnect);

  addTool(toolDefReadLiveSet);
  addTool(toolDefUpdateLiveSet);

  addTool(toolDefCreateTrack);
  addTool(toolDefReadTrack);
  addTool(toolDefUpdateTrack);

  addTool(toolDefCreateScene);
  addTool(toolDefReadScene);
  addTool(toolDefUpdateScene);

  addTool(toolDefCreateClip);
  addTool(toolDefReadClip);
  addTool(toolDefUpdateClip);

  // Commented out Sept 2025 - never used, keeps context window smaller
  // See src/tools/read-device.js for historical context
  // addTool(toolDefReadDevice);

  addTool(toolDefPlayback);
  addTool(toolDefSelect);
  addTool(toolDefDelete);
  addTool(toolDefDuplicate);
  addTool(toolDefMemory);

  if (process.env.ENABLE_RAW_LIVE_API === "true") {
    addTool(toolDefRawLiveApi);
  }

  return server;
}
