// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type CallLiveApiFunction,
  createMcpServer,
} from "#src/mcp-server/create-mcp-server.ts";

export interface ManifestTool {
  name: string;
  description: string;
}

interface RegisteredTool {
  description: string;
}

/**
 * List the tools for the desktop extension manifest. `name` is the tool id
 * (`ppal-read-clip`), not its display title. The direct Live API tool is off by
 * default, so it is left out.
 *
 * @returns One entry per standard tool: its id and first description line
 */
export function getManifestTools(): ManifestTool[] {
  const server = createMcpServer(null as unknown as CallLiveApiFunction);
  const registeredTools = (
    server as unknown as { _registeredTools: Record<string, RegisteredTool> }
  )._registeredTools;

  return Object.entries(registeredTools).map(([name, toolInfo]) => ({
    name,
    description: toolInfo.description.split("\n")[0] ?? "",
  }));
}
