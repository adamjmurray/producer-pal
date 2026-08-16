// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared helpers for ppal-clip e2e tests.
 * Provides common MIDI clip creation, reading, transform application, and
 * notation round-trip utilities.
 */
import { afterAll, expect } from "vitest";
import { type NoteEvent } from "#src/notation/types.ts";
import { type Notation } from "#src/shared/notation.ts";
import {
  type CreateClipResult,
  parseToolResult,
  type ReadClipResult,
  resetConfig,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";

export const emptyMidiTrack = 8; // t8 "9-MIDI" from e2e-test-set

/** One triplet subdivision in beats — the round-trip suites' unit of spacing. */
export const THIRD = 1 / 3;

const TOOL_CREATE_CLIP = "ppal-create-clip";

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
    name: TOOL_CREATE_CLIP,
    arguments: {
      slot: `${emptyMidiTrack}/${sceneIndex}`,
      notes,
      length: "2bar",
    },
  });
  const clip = parseToolResult<CreateClipResult>(result);

  await sleep(100);

  return clip.id;
}

/**
 * Creates a session clip in `slot` with arbitrary create-clip arguments, for
 * suites that vary looping/length/notes per case rather than taking
 * {@link createMidiClip}'s fixed 2-bar shape.
 * @param ctx - MCP test context with client
 * @param slot - Session slot (trackIndex/sceneIndex)
 * @param args - Create-clip arguments beyond the slot (notes, length, looping)
 * @returns Clip ID
 */
export async function createClipInSlot(
  ctx: { client: { callTool: CallToolFn } | null },
  slot: string,
  args: Record<string, unknown>,
): Promise<string> {
  const clip = parseToolResult<CreateClipResult>(
    await ctx.client!.callTool({
      name: TOOL_CREATE_CLIP,
      arguments: { slot, ...args },
    }),
  );

  await sleep(100);

  return clip.id;
}

/**
 * Creates a MIDI arrangement clip with notes at given position.
 * @param ctx - MCP test context with client
 * @param arrangementStart - Bar|beat position for clip start
 * @param notes - Notation string for notes
 * @param length - Clip length as a duration (e.g. "1bar", "n/4", "1bar+n/4")
 * @returns Clip ID
 */
export async function createArrangementClip(
  ctx: { client: { callTool: CallToolFn } | null },
  arrangementStart: string,
  notes: string,
  length: string,
): Promise<string> {
  const result = await ctx.client!.callTool({
    name: TOOL_CREATE_CLIP,
    arguments: {
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

/**
 * Applies a transform to a batch of clips (comma-joined ids) and returns the
 * raw result. Used by clip-axis (clipseq) tests that act on multiple clips.
 * @param ctx - MCP test context with client
 * @param clipIds - Clip IDs to transform together
 * @param transform - Transform expression string
 * @returns Raw tool result (for warning inspection)
 */
export async function applyTransformToClips(
  ctx: { client: { callTool: CallToolFn } | null },
  clipIds: string[],
  transform: string,
): Promise<unknown> {
  const result = await ctx.client!.callTool({
    name: "ppal-update-clip",
    arguments: { ids: clipIds.join(","), transforms: transform },
  });

  await sleep(100);

  return result;
}

/**
 * Parse a notation duration value that may be decimal, fraction, or mixed number.
 * Examples: "0.75", "11/16", "1+1/2", "/4", "0.873/4" (off-grid escape)
 * @param value - Duration string from notation output
 * @returns Numeric duration value
 */
export function parseNotationDuration(value: string): number {
  // Mixed number: "1+1/2"
  const mixedMatch = value.match(/^(\d+)\+(\d+)\/(\d+)$/);

  if (mixedMatch) {
    return (
      Number(mixedMatch[1]) + Number(mixedMatch[2]) / Number(mixedMatch[3])
    );
  }

  // Fraction: "11/16", "/4", or off-grid decimal numerator "0.873/4"
  const fracMatch = value.match(/^(\d+\.\d+|\d*)\/(\d+)$/);

  if (fracMatch) {
    const num = fracMatch[1] === "" ? 1 : Number(fracMatch[1]);

    return num / Number(fracMatch[2]);
  }

  // Decimal or integer
  return Number(value);
}

type CallToolFn = (args: {
  name: string;
  arguments: Record<string, unknown>;
}) => Promise<unknown>;

type McpTestContext = { client: { callTool: CallToolFn } | null };

/**
 * Creates bound helper functions from a test context, eliminating the need
 * for per-file wrapper functions that just forward the ctx parameter.
 * @param ctx - MCP test context with client
 * @returns Object with bound helper functions
 */
export function createClipTransformHelpers(ctx: McpTestContext): {
  createMidiClip: (sceneIndex: number, notes: string) => Promise<string>;
  createArrangementClip: (
    arrangementStart: string,
    notes: string,
    length: string,
  ) => Promise<string>;
  readClipNotes: (clipId: string) => Promise<string>;
  applyTransform: (clipId: string, transform: string) => Promise<unknown>;
  applyTransformToClips: (
    clipIds: string[],
    transform: string,
  ) => Promise<unknown>;
} {
  return {
    createMidiClip: (sceneIndex, notes) =>
      createMidiClip(ctx, sceneIndex, notes),
    createArrangementClip: (arrangementStart, notes, length) =>
      createArrangementClip(ctx, arrangementStart, notes, length),
    readClipNotes: (clipId) => readClipNotes(ctx, clipId),
    applyTransform: (clipId, transform) =>
      applyTransform(ctx, clipId, transform),
    applyTransformToClips: (clipIds, transform) =>
      applyTransformToClips(ctx, clipIds, transform),
  };
}

/**
 * Registers the MCP test hooks and returns the bound clip-transform helpers in
 * one call, collapsing the per-file setup+destructure boilerplate that the
 * transform round-trip suites share.
 * @returns Bound { createMidiClip, createArrangementClip, readClipNotes, applyTransform }
 */
export function setupClipTransformTest(): ReturnType<
  typeof createClipTransformHelpers
> {
  return createClipTransformHelpers(setupMcpTestContext());
}

/**
 * Create a MIDI clip with `notes` in `slot`, read it back under `notation`, and
 * re-interpret the serialized notation into note events. Flips the server to
 * `notation` per call (the per-test setup resets it beforehand, so setting it
 * inside the test body is what actually takes effect for the read-back). Shared
 * by the triplet round-trip suites (MIDI JSON ratios and Stark triplets).
 * @param ctx - MCP test context with client
 * @param slot - Session slot (trackIndex/sceneIndex)
 * @param notes - Notation string for the clip's notes
 * @param notation - Read-back notation mode to configure the server with
 * @param interpret - Re-interprets the read-back notation string into events
 * @returns The read-back notation and its re-interpreted note events
 */
export async function createAndReadback(
  ctx: { client: { callTool: CallToolFn } | null },
  slot: string,
  notes: string,
  notation: Notation,
  interpret: (notation: string) => NoteEvent[],
): Promise<{ notation: string; events: NoteEvent[] }> {
  await setConfig({ notation });

  const readback = await readClipNotes(
    ctx,
    await createClipInSlot(ctx, slot, { notes }),
  );

  return { notation: readback, events: interpret(readback) };
}

/**
 * Restore the default notation after the calling file. The per-test setup
 * already resets before each test, so this only tidies the trailing server
 * state for suites that flip notation inside their test bodies.
 */
export function restoreNotationAfterAll(): void {
  afterAll(async () => {
    await resetConfig();
  });
}

/**
 * Assert time-sorted `events` match `pitches` at a constant `step`-beat spacing,
 * each sustaining `step` beats, within float tolerance for the device round-trip.
 * @param events - Re-interpreted read-back note events
 * @param pitches - Expected MIDI pitches in time order
 * @param step - Expected onset spacing and duration in beats (the triplet value)
 */
export function expectEvenlySpaced(
  events: NoteEvent[],
  pitches: number[],
  step: number,
): void {
  const sorted = events.toSorted((a, b) => a.start_time - b.start_time);

  expect(sorted).toHaveLength(pitches.length);

  sorted.forEach((event, i) => {
    expect(event.pitch).toBe(pitches[i]);
    expect(event.start_time).toBeCloseTo(i * step, 3);
    expect(event.duration).toBeCloseTo(step, 3);
  });
}
