// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared helpers for ppal-clip-transforms e2e tests.
 * Provides common MIDI clip creation, reading, and transform application utilities.
 */
import {
  type CreateClipResult,
  parseToolResult,
  type ReadClipResult,
  sleep,
} from "../../mcp-test-helpers.ts";

export const emptyMidiTrack = 8; // t8 "9-MIDI" from e2e-test-set

/**
 * Creates a MIDI clip with specified notes on the empty MIDI track.
 * @param ctx - MCP test context with client
 * @param sceneIndex - Session scene index
 * @param notes - Notation string for notes
 * @returns Clip ID
 */
export async function createMidiClip(
  ctx: { client: { callTool: CallToolFn } | null },
  sceneIndex: number,
  notes: string,
): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: {
      view: "session",
      trackIndex: emptyMidiTrack,
      sceneIndex: String(sceneIndex),
      notes,
      length: "2:0.0",
    },
  });
  const clip = parseToolResult<CreateClipResult>(result);

  await sleep(100);

  return clip.id;
}

/**
 * Creates a MIDI arrangement clip with notes at given position.
 * @param ctx - MCP test context with client
 * @param arrangementStart - Bar|beat position for clip start
 * @param notes - Notation string for notes
 * @param length - Bar:beat duration for clip length
 * @returns Clip ID
 */
export async function createArrangementClip(
  ctx: { client: { callTool: CallToolFn } | null },
  arrangementStart: string,
  notes: string,
  length: string,
): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: {
      view: "arrangement",
      trackIndex: emptyMidiTrack,
      arrangementStart,
      notes,
      length,
    },
  });
  const clip = parseToolResult<CreateClipResult>(result);

  await sleep(100);

  return clip.id;
}

/**
 * Reads clip notes as a notation string.
 * @param ctx - MCP test context with client
 * @param clipId - Clip ID to read
 * @returns Formatted notes string
 */
export async function readClipNotes(
  ctx: { client: { callTool: CallToolFn } | null },
  clipId: string,
): Promise<string> {
  // TODO: this _might_ be avoiding some flakiness due to
  // race conditions in successive Live API calls.
  // Ideally the tool would handle this so the client doesn't need
  // to worry about it. Needs investigation.
  await sleep(50);

  const result = await ctx.client!.callTool({
    name: "ppal-read-clip",
    arguments: { clipId, include: ["notes"] },
  });
  const clip = parseToolResult<ReadClipResult>(result);

  return clip.notes ?? "";
}

/**
 * Applies a transform to a clip and returns the raw result.
 * @param ctx - MCP test context with client
 * @param clipId - Clip ID to transform
 * @param transform - Transform expression string
 * @returns Raw tool result (for warning inspection)
 */
export async function applyTransform(
  ctx: { client: { callTool: CallToolFn } | null },
  clipId: string,
  transform: string,
): Promise<unknown> {
  const result = await ctx.client!.callTool({
    name: "ppal-update-clip",
    arguments: { ids: clipId, transforms: transform },
  });

  await sleep(100);

  return result;
}

type CallToolFn = (args: {
  name: string;
  arguments: Record<string, unknown>;
}) => Promise<unknown>;
