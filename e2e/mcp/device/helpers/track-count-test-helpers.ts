// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { parseToolResult } from "../../mcp-test-helpers.ts";

/**
 * How many tracks the Set holds right now.
 * @param client - Connected MCP client
 * @returns The track count
 */
export async function readTrackCount(client: Client): Promise<number> {
  const liveSet = parseToolResult<{ tracks?: unknown[] }>(
    await client.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["tracks"] },
    }),
  );

  return liveSet.tracks?.length ?? 0;
}
