import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "../shared/version.js";
import { toolDefCreateClip } from "../tools/clip/create/create-clip.def.js";
import { toolDefReadClip } from "../tools/clip/read/read-clip.def.js";
import { toolDefUpdateClip } from "../tools/clip/update/update-clip.def.js";
import { toolDefPlayback } from "../tools/control/playback.def.js";
import { toolDefRawLiveApi } from "../tools/control/raw-live-api.def.js";
import { toolDefSelect } from "../tools/control/select.def.js";
import { toolDefCreateDevice } from "../tools/device/create/create-device.def.js";
import { toolDefCreateInstrumentRack } from "../tools/device/create/create-instrument-rack.def.js";
import { toolDefReadDevice } from "../tools/device/read-device.def.js";
import { toolDefUpdateDevice } from "../tools/device/update/update-device.def.js";
import { toolDefCreateDrumPadRack } from "../tools/device/create/create-drum-pad-rack.def.js";
import { toolDefReadLiveSet } from "../tools/live-set/read-live-set.def.js";
import { toolDefUpdateLiveSet } from "../tools/live-set/update-live-set.def.js";
import { toolDefDelete } from "../tools/operations/delete/delete.def.js";
import { toolDefDuplicate } from "../tools/operations/duplicate/duplicate.def.js";
import { toolDefTransformClips } from "../tools/operations/transform-clips/transform-clips.def.js";
import { toolDefReadSamples } from "../tools/samples/read-samples.def.js";
import { toolDefCreateScene } from "../tools/scene/create-scene.def.js";
import { toolDefReadScene } from "../tools/scene/read-scene.def.js";
import { toolDefUpdateScene } from "../tools/scene/update-scene.def.js";
import { toolDefCreateTrack } from "../tools/track/create/create-track.def.js";
import { toolDefReadTrack } from "../tools/track/read/read-track.def.js";
import { toolDefUpdateTrack } from "../tools/track/update/update-track.def.js";
import { toolDefConnect } from "../tools/workflow/connect.def.js";
import { toolDefMemory } from "../tools/workflow/memory.def.js";

/**
 * Create and configure an MCP server instance
 *
 * @param {Function} callLiveApi - Function to call Live API
 * @param {object} options - Configuration options
 * @returns {McpServer} Configured MCP server instance
 */
export function createMcpServer(callLiveApi, options = {}) {
  const { smallModelMode = false } = options;

  const server = new McpServer({
    name: "Ableton Live Producer Pal: AI tools for producing music in Ableton Live",
    version: VERSION,
  });

  const addTool = (toolDef) => toolDef(server, callLiveApi, { smallModelMode });

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
  addTool(toolDefTransformClips);

  addTool(toolDefCreateDevice);
  addTool(toolDefCreateInstrumentRack);
  addTool(toolDefCreateDrumPadRack);
  addTool(toolDefReadDevice);
  addTool(toolDefUpdateDevice);

  addTool(toolDefPlayback);
  addTool(toolDefSelect);
  addTool(toolDefDelete);
  addTool(toolDefDuplicate);
  addTool(toolDefMemory);
  addTool(toolDefReadSamples);

  if (process.env.ENABLE_RAW_LIVE_API === "true") {
    addTool(toolDefRawLiveApi);
  }

  return server;
}
