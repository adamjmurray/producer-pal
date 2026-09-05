// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Reading and updating a clip, for any e2e suite that has to do both. */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { expect } from "vitest";
import {
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  sleep,
} from "../../mcp-test-helpers.ts";
import { arrangementStartOf } from "./arrangement-start-test-helpers.ts";

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
 * @param position - Position in bar|beat format
 * @returns The clip at that position, if any
 */
export async function arrangementClipAt(
  client: Client,
  trackIndex: number,
  position: string,
): Promise<ReadClipResult | undefined> {
  const result = await client.callTool({
    name: "ppal-read-track",
    arguments: { path: `t${trackIndex}`, include: ["arrangement-clips"] },
  });
  const { data } = parseToolResultWithWarnings<{
    arrangementClips?: ReadClipResult[];
  }>(result);

  return data.arrangementClips?.find(
    (clip) => arrangementStartOf(clip) === position,
  );
}

/**
 * Update a clip that must be refused: the warning says why, and the clip comes
 * back unchanged, so the caller can go on to check it is still where it was.
 * @param client - The connected MCP client
 * @param id - The clip that must stay put
 * @param args - The rest of the ppal-update-clip arguments
 * @param warning - Text the refusal warning must contain
 */
export async function expectRefusedUpdate(
  client: Client,
  id: string,
  args: Record<string, unknown>,
  warning: string,
): Promise<void> {
  const { data: kept, warnings } = await updateClip(client, id, args);

  expect(warnings.join(" ")).toContain(warning);
  expect(kept.id).toBe(id);
}

/**
 * Move a take-lane clip and check Live emptied the source instead of deleting
 * it — delete_clip no-ops on a take-lane clip, so the move copies the content
 * and leaves an emptied clip where it stood.
 * @param client - The connected MCP client
 * @param source - The take-lane clip being moved
 * @param toPath - Where the clip is going
 * @returns The clip as read back at its new home
 */
export async function moveOffTakeLane(
  client: Client,
  source: Pick<ReadClipResult, "id" | "path">,
  toPath: string,
): Promise<ReadClipResult> {
  const { data: moved, warnings } = await updateClip(client, source.id, {
    toPath,
  });

  expect(warnings.join(" ")).toContain(
    `clip ${source.path} (id ${source.id}) was emptied instead of deleted`,
  );

  return readClipFully(client, { id: moved.id });
}
