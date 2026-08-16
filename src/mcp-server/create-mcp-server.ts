// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "#src/shared/config.ts";
import { type Notation } from "#src/shared/notation.ts";
import { toolDefDelete } from "#src/tools/actions/delete/delete.def.ts";
import { toolDefDuplicate } from "#src/tools/actions/duplicate/duplicate.def.ts";
import { toolDefLiveApi } from "#src/tools/advanced/live-api.def.ts";
import { toolDefCreateClip } from "#src/tools/clip/create/create-clip.def.ts";
import { toolDefReadClip } from "#src/tools/clip/read/read-clip.def.ts";
import { toolDefUpdateClip } from "#src/tools/clip/update/update-clip.def.ts";
import { toolDefConnect } from "#src/tools/core/connect.def.ts";
import { toolDefContext } from "#src/tools/core/context.def.ts";
import { toolDefCreateDevice } from "#src/tools/device/create/create-device.def.ts";
import { toolDefReadDevice } from "#src/tools/device/read/read-device.def.ts";
import { toolDefUpdateDevice } from "#src/tools/device/update/update-device.def.ts";
import { toolDefReadLiveSet } from "#src/tools/live-set/read-live-set.def.ts";
import { toolDefUpdateLiveSet } from "#src/tools/live-set/update-live-set.def.ts";
import { toolDefCreateScene } from "#src/tools/scene/create-scene.def.ts";
import { toolDefReadScene } from "#src/tools/scene/read-scene.def.ts";
import { toolDefUpdateScene } from "#src/tools/scene/update-scene.def.ts";
import { toolDefLibrary } from "#src/tools/session/library.def.ts";
import { toolDefPlayback } from "#src/tools/session/playback.def.ts";
import { toolDefSelect } from "#src/tools/session/select.def.ts";
import { type ToolDefFunction } from "#src/tools/shared/tool-framework/define-tool.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import { toolDefCreateTrack } from "#src/tools/track/create/create-track.def.ts";
import { toolDefReadTrack } from "#src/tools/track/read/read-track.def.ts";
import { toolDefUpdateTrack } from "#src/tools/track/update/update-track.def.ts";
import { type RequestOverrides } from "./helpers/request-overrides/request-overrides.ts";

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

/**
 * Union of params a small model never sees, across all standard tools: the ones
 * its mode hides (`smallModel: null`) plus the deprecated ones no mode
 * publishes. Read off `resolveToolSchema`, the one place that answers "what does
 * the model get", so a retired param can't leak back in. The eval framework
 * consults this to SKIP (not fail) scenarios that depend on such a param —
 * keeping small-model scores apples-to-apples. NOTE: a flat union skips
 * CONSERVATIVELY — a shared param name hidden by only SOME tools (e.g. `name`:
 * hidden on ppal-context along with its memory scope, still live on the
 * create/update tools) skips every scenario requiring that name. If a scenario
 * ever legitimately requires such a param on a tool that keeps it, the skip
 * check must become tool-scoped.
 */
export const SMALL_MODEL_EXCLUDED_PARAMS: ReadonlySet<string> = new Set(
  STANDARD_TOOL_DEFS.flatMap((td) => {
    const { inputSchema } = td.toolOptions;
    const { published } = resolveToolSchema(inputSchema, {
      smallModelMode: true,
    });

    return Object.keys(inputSchema).filter((key) => !(key in published));
  }),
);

interface CreateMcpServerOptions {
  smallModelMode?: boolean;
  liveApiEnabled?: boolean;
  tools?: string[];
  /**
   * Active notation (`config.notation`). Threaded to each tool so notation-keyed
   * description overrides (e.g. the `notes` param's format text) reflect the
   * notation in effect. Omitted ⇒ bar|beat default (no overrides applied).
   */
  notation?: Notation;
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
  const {
    smallModelMode = false,
    liveApiEnabled = false,
    tools,
    notation,
  } = options;
  const includedSet = tools ? new Set(tools) : null;

  const server = new McpServer({
    name: "Ableton Live Producer Pal: AI tools for producing music in Ableton Live",
    version: VERSION,
  });

  for (const toolDef of STANDARD_TOOL_DEFS) {
    if (includedSet && !includedSet.has(toolDef.toolName)) continue;
    toolDef(server, callLiveApi, { smallModelMode, notation });
  }

  // Live API: opt-in via device Setup tab. Goes through the same
  // tools whitelist as standard tools. Excluded under smallModelMode
  // because its schema is too large to be useful with small models.
  if (
    liveApiEnabled &&
    !smallModelMode &&
    (!includedSet || includedSet.has(toolDefLiveApi.toolName))
  ) {
    toolDefLiveApi(server, callLiveApi, { smallModelMode, notation });
  }

  return server;
}

/**
 * Validate the `tools` whitelist from a POST /config request: every name must
 * be a known tool (ppal-live-api only when the Live API tool is enabled) and
 * ppal-connect must be present (it is the required entry point). Lives here,
 * with the tool registry that owns TOOL_NAMES, rather than in the route handler.
 *
 * @param tools - The tools value from the request body
 * @param liveApiEnabled - Whether ppal-live-api is an accepted tool name
 * @returns An error response body when invalid, or null when valid
 */
export function validateTools(
  tools: unknown,
  liveApiEnabled: boolean,
): { error: string; validToolNames: string[] } | null {
  const validToolNames = getValidToolNames(liveApiEnabled);
  const validToolSet = new Set<string>(validToolNames);

  if (!Array.isArray(tools)) {
    return { error: "tools must be an array of tool names", validToolNames };
  }

  const list = tools.map(String);
  const invalid = list.filter((name) => !validToolSet.has(name));

  if (invalid.length > 0) {
    return {
      error: `Invalid tool name(s): ${invalid.join(", ")}`,
      validToolNames,
    };
  }

  if (!list.includes("ppal-connect")) {
    return {
      error:
        "ppal-connect must be included in tools (it is the required entry point)",
      validToolNames,
    };
  }

  return null;
}

/**
 * The list of valid tool names, including ppal-live-api when enabled.
 *
 * @param liveApiEnabled - Whether ppal-live-api is an accepted tool name
 * @returns The valid tool names
 */
function getValidToolNames(liveApiEnabled: boolean): string[] {
  if (!liveApiEnabled) return [...TOOL_NAMES];

  return [...TOOL_NAMES, toolDefLiveApi.toolName];
}
