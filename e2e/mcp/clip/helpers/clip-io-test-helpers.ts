// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Reading and updating a clip, for any e2e suite that has to do both. */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  sleep,
} from "../../mcp-test-helpers.ts";

/**
 * Read a clip by id or path, with every include.
 * @param client - The connected MCP client
 * @param target - Either `{ id }` or `{ path }`
 * @returns The clip
 */
export async function readClipFully(
  client: Client,
  target: { id: string | null } | { path: string },
): Promise<ReadClipResult> {
  const result = await client.callTool({
    name: "ppal-read-clip",
    arguments: { ...target, include: ["*"] },
  });

  return parseToolResult<ReadClipResult>(result);
}

/**
 * Update a clip, keeping any warnings so a refusal can be asserted.
 * @param client - The connected MCP client
 * @param id - Clip id
 * @param args - The rest of the ppal-update-clip arguments
 * @returns The result and its warnings
 */
export async function updateClip(
  client: Client,
  id: string | null,
  args: Record<string, unknown>,
): Promise<{ data: ReadClipResult; warnings: string[] }> {
  const result = await client.callTool({
    name: "ppal-update-clip",
    arguments: { id, ...args },
  });

  await sleep(100);

  return parseToolResultWithWarnings<ReadClipResult>(result);
}

/**
 * Update a clip and read it back with every include.
 * @param client - The connected MCP client
 * @param id - Clip id
 * @param args - The rest of the ppal-update-clip arguments
 * @returns The clip as read back, and any warnings the update reported
 */
export async function updateAndRead(
  client: Client,
  id: string,
  args: Record<string, unknown>,
): Promise<{ clip: ReadClipResult; warnings: string[] }> {
  const { warnings } = await updateClip(client, id, args);

  return { clip: await readClipFully(client, { id }), warnings };
}

/**
 * Read the main-lane arrangement clip at an exact position on a track.
 * @param client - The connected MCP client
 * @param trackIndex - Track index
 * @param arrangementStart - Position in bar|beat format
 * @returns The clip at that position, if any
 */
export async function arrangementClipAt(
  client: Client,
  trackIndex: number,
  arrangementStart: string,
): Promise<ReadClipResult | undefined> {
  const result = await client.callTool({
    name: "ppal-read-track",
    arguments: { trackIndex, include: ["arrangement-clips"] },
  });
  const { data } = parseToolResultWithWarnings<{
    arrangementClips?: ReadClipResult[];
  }>(result);

  return data.arrangementClips?.find(
    (clip) => clip.arrangementStart === arrangementStart,
  );
}
