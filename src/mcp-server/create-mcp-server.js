import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "#src/shared/version.js";
import { toolDefCreateClip } from "#src/tools/clip/create/create-clip.def.js";
import { toolDefReadClip } from "#src/tools/clip/read/read-clip.def.js";
import { toolDefUpdateClip } from "#src/tools/clip/update/update-clip.def.js";
import { toolDefPlayback } from "#src/tools/control/playback.def.js";
import { toolDefRawLiveApi } from "#src/tools/control/raw-live-api.def.js";
import { toolDefSelect } from "#src/tools/control/select.def.js";
import { toolDefCreateDevice } from "#src/tools/device/create/create-device.def.js";
import { toolDefReadDevice } from "#src/tools/device/read-device.def.js";
import { toolDefUpdateDevice } from "#src/tools/device/update/update-device.def.js";
import { toolDefReadLiveSet } from "#src/tools/live-set/read-live-set.def.js";
import { toolDefUpdateLiveSet } from "#src/tools/live-set/update-live-set.def.js";
import { toolDefDelete } from "#src/tools/operations/delete/delete.def.js";
import { toolDefDuplicate } from "#src/tools/operations/duplicate/duplicate.def.js";
import { toolDefTransformClips } from "#src/tools/operations/transform-clips/transform-clips.def.js";
import { toolDefReadSamples } from "#src/tools/samples/read-samples.def.js";
import { toolDefCreateScene } from "#src/tools/scene/create-scene.def.js";
import { toolDefReadScene } from "#src/tools/scene/read-scene.def.js";
import { toolDefUpdateScene } from "#src/tools/scene/update-scene.def.js";
import { toolDefCreateTrack } from "#src/tools/track/create/create-track.def.js";
import { toolDefReadTrack } from "#src/tools/track/read/read-track.def.js";
import { toolDefUpdateTrack } from "#src/tools/track/update/update-track.def.js";
import { toolDefConnect } from "#src/tools/workflow/connect.def.js";
import { toolDefMemory } from "#src/tools/workflow/memory.def.js";

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
