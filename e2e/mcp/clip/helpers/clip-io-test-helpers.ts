// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Creating, reading and updating a clip, for e2e suites that do several. */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { expect } from "vitest";
import {
  type CreateClipResult,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  sleep,
} from "../../mcp-test-helpers.ts";
import { arrangementStartOf } from "./arrangement-start-test-helpers.ts";

/**
 * Create a MIDI arrangement clip, on a track or on one of its take lanes.
 * @param client - The connected MCP client
 * @param trackIndex - Track index
 * @param position - Where the clip starts, in bar|beat format
 * @param args - The clip's name, its length ("1bar" by default), and a path
 *   suffix naming a take lane (e.g. "/l0")
 * @returns The created clip
 */
export async function createArrangementClip(
  client: Client,
  trackIndex: number,
  position: string,
  args: { name: string; length?: string; laneSuffix?: string },
): Promise<CreateClipResult> {
  const result = await client.callTool({
    name: "ppal-create-clip",
    arguments: {
      path: `t${trackIndex}${args.laneSuffix ?? ""}[${position}]`,
      name: args.name,
      notes: "C3 D3 E3 F3 1|1",
      length: args.length ?? "1bar",
    },
  });

  await sleep(100);

  // Warnings are tolerated: creating on a take lane always warns that the lane
  // is hidden until the track's arrow is expanded.
  return parseToolResultWithWarnings<CreateClipResult>(result).data;
}

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
 * @returns The clip as read back, the update's own entry, and any warnings
 */
export async function updateAndRead(
  client: Client,
  id: string,
  args: Record<string, unknown>,
): Promise<{
  clip: ReadClipResult;
  entry: ReadClipResult;
  warnings: string[];
}> {
  const { data, warnings } = await updateClip(client, id, args);

  return { clip: await readClipFully(client, { id }), entry: data, warnings };
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
 * Move one clip, with nothing else asked of it, where the move must be refused.
 * Nothing landed and there is no list for an entry to hold a place in, so the
 * reason comes back as the error — and the clip is left where it was.
 * @param client - The connected MCP client
 * @param id - The clip that must stay put
 * @param args - The rest of the ppal-update-clip arguments
 * @param reason - Text the error must contain; every string of an array must
 *   appear, for a message with a Live-assigned id in the middle
 */
export async function expectRefusedUpdate(
  client: Client,
  id: string,
  args: Record<string, unknown>,
  reason: string | string[],
): Promise<void> {
  const result = await client.callTool({
    name: "ppal-update-clip",
    arguments: { id, ...args },
  });

  await sleep(100);

  expect(isToolError(result)).toBe(true);

  const message = getToolErrorMessage(result);

  for (const part of typeof reason === "string" ? [reason] : reason) {
    expect(message).toContain(part);
  }
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
  const { data: moved } = await updateClip(client, source.id, { toPath });

  expect(moved.detail).toContain("emptied instead of deleted");

  return readClipFully(client, { id: moved.id });
}
