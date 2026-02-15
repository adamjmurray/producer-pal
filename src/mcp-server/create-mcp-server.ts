// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "#src/shared/version.ts";
import { toolDefCreateClip } from "#src/tools/clip/create/create-clip.def.ts";
import { toolDefReadClip } from "#src/tools/clip/read/read-clip.def.ts";
import { toolDefUpdateClip } from "#src/tools/clip/update/update-clip.def.ts";
import { toolDefPlayback } from "#src/tools/control/playback.def.ts";
import { toolDefRawLiveApi } from "#src/tools/control/raw-live-api.def.ts";
import { toolDefSelect } from "#src/tools/control/select.def.ts";
import { toolDefCreateDevice } from "#src/tools/device/create/create-device.def.ts";
import { toolDefReadDevice } from "#src/tools/device/read/read-device.def.ts";
import { toolDefUpdateDevice } from "#src/tools/device/update/update-device.def.ts";
import { toolDefReadLiveSet } from "#src/tools/live-set/read-live-set.def.ts";
import { toolDefUpdateLiveSet } from "#src/tools/live-set/update-live-set.def.ts";
import { toolDefDelete } from "#src/tools/operations/delete/delete.def.ts";
import { toolDefDuplicate } from "#src/tools/operations/duplicate/duplicate.def.ts";
import { toolDefCreateScene } from "#src/tools/scene/create-scene.def.ts";
import { toolDefReadScene } from "#src/tools/scene/read-scene.def.ts";
import { toolDefUpdateScene } from "#src/tools/scene/update-scene.def.ts";
import type { ToolDefFunction } from "#src/tools/shared/tool-framework/define-tool.ts";
import { toolDefCreateTrack } from "#src/tools/track/create/create-track.def.ts";
import { toolDefReadTrack } from "#src/tools/track/read/read-track.def.ts";
import { toolDefUpdateTrack } from "#src/tools/track/update/update-track.def.ts";
import { toolDefSession } from "#src/tools/workflow/session.def.ts";

export type CallLiveApiFunction = (
  tool: string,
  args: object,
) => Promise<object>;

const STANDARD_TOOL_DEFS: ToolDefFunction[] = [
  toolDefSession,
  toolDefReadLiveSet,
  toolDefUpdateLiveSet,
  toolDefCreateTrack,
  toolDefReadTrack,
  toolDefUpdateTrack,
  toolDefCreateScene,
  toolDefReadScene,
  toolDefUpdateScene,
  toolDefCreateClip,
  toolDefReadClip,
  toolDefUpdateClip,
  toolDefCreateDevice,
  toolDefReadDevice,
  toolDefUpdateDevice,
  toolDefPlayback,
  toolDefSelect,
  toolDefDelete,
  toolDefDuplicate,
];

/** All standard tool names (frozen). Does not include dev-only tools like ppal-raw-live-api. */
export const TOOL_NAMES: readonly string[] = Object.freeze(
  STANDARD_TOOL_DEFS.map((td) => td.toolName),
);

interface CreateMcpServerOptions {
  smallModelMode?: boolean;
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
  const { smallModelMode = false, tools } = options;
  const includedSet = tools ? new Set(tools) : null;

  const server = new McpServer({
    name: "Ableton Live Producer Pal: AI tools for producing music in Ableton Live",
    version: VERSION,
  });

  for (const toolDef of STANDARD_TOOL_DEFS) {
    if (includedSet && !includedSet.has(toolDef.toolName)) continue;
    toolDef(server, callLiveApi, { smallModelMode });
  }

  // Dev-only tool: bypasses the tools whitelist, gated by env var
  if (process.env.ENABLE_RAW_LIVE_API === "true" && !smallModelMode) {
    toolDefRawLiveApi(server, callLiveApi, { smallModelMode });
  }

  return server;
}
