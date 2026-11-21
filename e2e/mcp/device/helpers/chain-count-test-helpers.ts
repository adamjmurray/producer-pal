// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { parseToolResult, sleep } from "../../mcp-test-helpers.ts";

/**
 * How many chains a rack holds right now.
 * @param client - Connected MCP client
 * @param rackPath - The rack's path
 * @returns The chain count
 */
export async function readChainCount(
  client: Client,
  rackPath: string,
): Promise<number> {
  await sleep(150);

  const rack = parseToolResult<{ chains?: unknown[] }>(
    await client.callTool({
      name: "ppal-read-device",
      arguments: { path: rackPath, include: ["chains"] },
    }),
  );

  return rack.chains?.length ?? 0;
}
