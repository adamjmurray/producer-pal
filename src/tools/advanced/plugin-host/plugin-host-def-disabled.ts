// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Disabled stub for plugin-host.def.ts.
 * Substituted by rolldown when ENABLE_LIVE_API is not set. create-mcp-server.ts
 * never registers it then, so it only has to export the same name: the real
 * module's `defineTool` call can't be tree-shaken, and would leave the tool's
 * description and schema text in a release bundle.
 *
 * IMPORTANT: If this file is renamed or moved, update its entry in
 * config/rolldown-plugin-stub-modules.mjs (PLUGIN_HOST_TOOL_STUBS) to match.
 */

import { type ToolDefFunction } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefPluginHost = undefined as unknown as ToolDefFunction;
