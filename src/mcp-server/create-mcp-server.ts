// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "#src/shared/version.ts";
import { toolDefCreateClip } from "#src/tools/clip/create/create-clip.def.ts";
import { toolDefReadClip } from "#src/tools/clip/read/read-clip.def.ts";
import { toolDefUpdateClip } from "#src/tools/clip/update/update-clip.def.ts";
import { toolDefLiveApi } from "#src/tools/control/live-api.def.ts";
import { toolDefPlayback } from "#src/tools/control/playback.def.ts";
import { toolDefSelect } from "#src/tools/control/select.def.ts";
import { toolDefCreateDevice } from "#src/tools/device/create/create-device.def.ts";
import { toolDefReadDevice } from "#src/tools/device/read/read-device.def.ts";
import { toolDefUpdateDevice } from "#src/tools/device/update/update-device.def.ts";
import { toolDefLibrary } from "#src/tools/library/library.def.ts";
import { toolDefReadLiveSet } from "#src/tools/live-set/read-live-set.def.ts";
import { toolDefUpdateLiveSet } from "#src/tools/live-set/update-live-set.def.ts";
import { toolDefDelete } from "#src/tools/operations/delete/delete.def.ts";
import { toolDefDuplicate } from "#src/tools/operations/duplicate/duplicate.def.ts";
import { toolDefCreateScene } from "#src/tools/scene/create-scene.def.ts";
import { toolDefReadScene } from "#src/tools/scene/read-scene.def.ts";
import { toolDefUpdateScene } from "#src/tools/scene/update-scene.def.ts";
import { type ToolDefFunction } from "#src/tools/shared/tool-framework/define-tool.ts";
import { toolDefCreateTrack } from "#src/tools/track/create/create-track.def.ts";
import { toolDefReadTrack } from "#src/tools/track/read/read-track.def.ts";
import { toolDefUpdateTrack } from "#src/tools/track/update/update-track.def.ts";
import { toolDefConnect } from "#src/tools/workflow/connect.def.ts";
import { toolDefContext } from "#src/tools/workflow/context.def.ts";
import { type RequestOverrides } from "./request-overrides.ts";

export type CallLiveApiFunction = (
  tool: string,
  args: object,
  overrides?: RequestOverrides,
) => Promise<object>;

export const STANDARD_TOOL_DEFS: ToolDefFunction[] = [
  toolDefConnect,
  toolDefContext,
  toolDefReadLiveSet,
  toolDefUpdateLiveSet,
  toolDefReadTrack,
  toolDefCreateTrack,
  toolDefUpdateTrack,
  toolDefReadScene,
  toolDefCreateScene,
  toolDefUpdateScene,
  toolDefReadClip,
  toolDefCreateClip,
  toolDefUpdateClip,
  toolDefReadDevice,
  toolDefCreateDevice,
  toolDefUpdateDevice,
  toolDefDelete,
  toolDefDuplicate,
  toolDefSelect,
  toolDefPlayback,
  toolDefLibrary,
];

/** All standard tool names (frozen). Opt-in tools like ppal-live-api are not included. */
export const TOOL_NAMES: readonly string[] = Object.freeze(
  STANDARD_TOOL_DEFS.map((td) => td.toolName),
);

interface CreateMcpServerOptions {
  smallModelMode?: boolean;
  liveApiEnabled?: boolean;
  tools?: string[];
}

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
  const { smallModelMode = false, liveApiEnabled = false, tools } = options;
  const includedSet = tools ? new Set(tools) : null;

  const server = new McpServer({
    name: "Ableton Live Producer Pal: AI tools for producing music in Ableton Live",
    version: VERSION,
  });

  for (const toolDef of STANDARD_TOOL_DEFS) {
    if (includedSet && !includedSet.has(toolDef.toolName)) continue;
    toolDef(server, callLiveApi, { smallModelMode });
  }

  // Raw Live API: opt-in via device Setup tab. Goes through the same
  // tools whitelist as standard tools. Excluded under smallModelMode
  // because its schema is too large to be useful with small models.
  if (
    liveApiEnabled &&
    !smallModelMode &&
    (!includedSet || includedSet.has(toolDefLiveApi.toolName))
  ) {
    toolDefLiveApi(server, callLiveApi, { smallModelMode });
  }

  return server;
}
