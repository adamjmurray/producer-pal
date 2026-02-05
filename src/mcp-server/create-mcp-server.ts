// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "#src/shared/version.ts";
import { toolDefCreateClip } from "#src/tools/clip/create/create-clip.def.ts";
import { toolDefReadClip } from "#src/tools/clip/read/read-clip.def.ts";
import { toolDefUpdateClip } from "#src/tools/clip/update/update-clip.def.ts";
import { toolDefPlayback } from "#src/tools/control/playback.def.ts";
import { toolDefRawLiveApi } from "#src/tools/control/raw-live-api.def.ts";
import { toolDefSelect } from "#src/tools/control/select.def.ts";
import { toolDefCreateDevice } from "#src/tools/device/create/create-device.def.ts";
import { toolDefReadDevice } from "#src/tools/device/read-device.def.ts";
import { toolDefUpdateDevice } from "#src/tools/device/update/update-device.def.ts";
import { toolDefReadLiveSet } from "#src/tools/live-set/read-live-set.def.ts";
import { toolDefUpdateLiveSet } from "#src/tools/live-set/update-live-set.def.ts";
import { toolDefDelete } from "#src/tools/operations/delete/delete.def.ts";
import { toolDefDuplicate } from "#src/tools/operations/duplicate/duplicate.def.ts";
import { toolDefTransformClips } from "#src/tools/operations/transform-clips/transform-clips.def.ts";
import { toolDefReadSamples } from "#src/tools/samples/read-samples.def.ts";
import { toolDefCreateScene } from "#src/tools/scene/create-scene.def.ts";
import { toolDefReadScene } from "#src/tools/scene/read-scene.def.ts";
import { toolDefUpdateScene } from "#src/tools/scene/update-scene.def.ts";
import { toolDefCreateTrack } from "#src/tools/track/create/create-track.def.ts";
import { toolDefReadTrack } from "#src/tools/track/read/read-track.def.ts";
import { toolDefUpdateTrack } from "#src/tools/track/update/update-track.def.ts";
import { toolDefConnect } from "#src/tools/workflow/connect.def.ts";
import { toolDefMemory } from "#src/tools/workflow/memory.def.ts";

export type CallLiveApiFunction = (
  tool: string,
  args: object,
) => Promise<object>;

interface CreateMcpServerOptions {
  smallModelMode?: boolean;
}

type ToolDefFunction = (
  server: McpServer,
  callLiveApi: CallLiveApiFunction,
  options: { smallModelMode: boolean },
) => void;

/**
 * Create and configure an MCP server instance
 *
 * @param callLiveApi - Function to call Live API
 * @param options - Configuration options
 * @returns Configured MCP server instance
 */
export function createMcpServer(
  callLiveApi: CallLiveApiFunction,
  options: CreateMcpServerOptions = {},
): McpServer {
  const { smallModelMode = false } = options;

  const server = new McpServer({
    name: "Ableton Live Producer Pal: AI tools for producing music in Ableton Live",
    version: VERSION,
  });

  const addTool = (toolDef: ToolDefFunction): void =>
    toolDef(server, callLiveApi, { smallModelMode });

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

  if (process.env.ENABLE_RAW_LIVE_API === "true" && !smallModelMode) {
    addTool(toolDefRawLiveApi);
  }

  return server;
}
