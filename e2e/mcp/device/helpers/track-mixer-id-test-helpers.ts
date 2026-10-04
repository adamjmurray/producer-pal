// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { parseToolResult, setConfig, sleep } from "../../mcp-test-helpers";

/**
 * The id of a track's mixer object, which no standard tool hands out. Reads it
 * through the direct Live API tool, switching that on for the rest of the test.
 * @param client - Connected MCP client
 * @param trackIndex - Index of the track whose mixer to find
 * @returns The mixer's id
 */
export async function readTrackMixerId(
  client: Client,
  trackIndex: number,
): Promise<string> {
  await setConfig({ liveApiEnabled: true });
  await sleep(50);

  const info = parseToolResult<{ id: string }>(
    await client.callTool({
      name: "ppal-live-api",
      arguments: {
        path: `live_set tracks ${trackIndex} mixer_device`,
        operations: [{ type: "info" }],
      },
    }),
  );

  return info.id;
}
