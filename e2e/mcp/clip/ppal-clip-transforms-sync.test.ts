// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for transform `sync` keyword on arrangement clips.
 * Verifies that waveform phase syncs to arrangement position instead of clip start.
 * Uses: e2e-test-set - t8 is empty MIDI track
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-clip-transforms-sync
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  getToolWarnings,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import {
  applyTransform as applyTransformHelper,
  emptyMidiTrack,
  readClipNotes as readClipNotesHelper,
} from "./helpers/ppal-clip-transforms-test-helpers.ts";

const ctx = setupMcpTestContext();

/** Creates a MIDI arrangement clip with notes at given position. */
async function createArrangementClip(
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

/** Creates a MIDI session clip with notes. */
async function createSessionClip(
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

/** Applies a transform to a clip. Returns raw result for warning inspection. */
async function applyTransform(
  clipId: string,
  transform: string,
): Promise<unknown> {
  return applyTransformHelper(ctx, clipId, transform);
}

/** Reads clip notes as a string. */
async function readClipNotes(clipId: string): Promise<string> {
  return readClipNotesHelper(ctx, clipId);
}

/** Extracts velocity values from formatted note string. */
function extractVelocities(notes: string): number[] {
  return [...notes.matchAll(/v(\d+)/g)].map((m) => Number(m[1]));
}

// =============================================================================
// Sync Keyword Tests (arrangement clips)
// =============================================================================

describe("ppal-clip-transforms-sync", () => {
  it("sync shifts waveform phase by arrangement position", async () => {
    // Clip at 1|3 = beat 2 in 4/4 time
    // 4 notes at beats 0,1,2,3 with velocity 64
    // Transform: velocity += 50 * cos(4t, sync)
    //
    // With sync, effectivePosition = notePos + 2:
    //   Note at 1|1: (0+2)/4 % 1 = 0.5, cos(0.5) = -1 → 64-50 = 14
    //   Note at 1|2: (1+2)/4 % 1 = 0.75, cos(0.75) = 0 → 64
    //   Note at 1|3: (2+2)/4 % 1 = 0.0, cos(0) = 1 → 64+50 = 114
    //   Note at 1|4: (3+2)/4 % 1 = 0.25, cos(0.25) = 0 → 64
    const clipId = await createArrangementClip(
      "1|3",
      "v64 C3 1|1\nv64 C3 1|2\nv64 C3 1|3\nv64 C3 1|4",
      "1:0.0",
    );

    await applyTransform(clipId, "velocity += 50 * cos(4t, sync)");
    const notes = await readClipNotes(clipId);
    const velocities = extractVelocities(notes);

    expect(velocities).toHaveLength(4);
    expect(velocities[0]).toBe(14);
    expect(velocities[1]).toBe(64);
    expect(velocities[2]).toBe(114);
    expect(velocities[3]).toBe(64);
  });

  it("without sync, phase is clip-relative regardless of arrangement position", async () => {
    // Same clip position but no sync — arrangement position should be ignored
    // Phase uses just notePos/4:
    //   Note at 1|1: 0/4 = 0, cos(0) = 1 → 64+50 = 114
    //   Note at 1|2: 1/4 = 0.25, cos(0.25) = 0 → 64
    //   Note at 1|3: 2/4 = 0.5, cos(0.5) = -1 → 64-50 = 14
    //   Note at 1|4: 3/4 = 0.75, cos(0.75) = 0 → 64
    const clipId = await createArrangementClip(
      "2|3",
      "v64 C3 1|1\nv64 C3 1|2\nv64 C3 1|3\nv64 C3 1|4",
      "1:0.0",
    );

    await applyTransform(clipId, "velocity += 50 * cos(4t)");
    const notes = await readClipNotes(clipId);
    const velocities = extractVelocities(notes);

    expect(velocities).toHaveLength(4);
    expect(velocities[0]).toBe(114);
    expect(velocities[1]).toBe(64);
    expect(velocities[2]).toBe(14);
    expect(velocities[3]).toBe(64);
  });

  it("session clip with sync skips the assignment with a warning", async () => {
    const clipId = await createSessionClip(35, "v64 C3 1|1\nv64 C3 1|2");

    const result = await applyTransform(
      clipId,
      "velocity += 50 * cos(4t, sync)",
    );
    const warnings = getToolWarnings(result);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.toLowerCase().includes("sync"))).toBe(true);

    // Velocities should be unchanged
    const notes = await readClipNotes(clipId);
    const velocities = extractVelocities(notes);

    for (const v of velocities) {
      expect(v).toBe(64);
    }
  });

  it("sync with phase offset combines both offsets", async () => {
    // Clip at 1|1 = beat 0 (arrangement start is 0)
    // Transform: velocity += 50 * cos(4t, 0.25, sync)
    // With clip.position=0, sync has no effect on phase, but offset adds 0.25
    //   Note at 1|1: base=(0+0)/4=0, +0.25=0.25, cos(0.25)=0 → v64
    //   Note at 1|2: base=(1+0)/4=0.25, +0.25=0.5, cos(0.5)=-1 → v14
    //   Note at 1|3: base=(2+0)/4=0.5, +0.25=0.75, cos(0.75)=0 → v64
    //   Note at 1|4: base=(3+0)/4=0.75, +0.25=1.0, cos(1.0)=1 → v114
    const clipId = await createArrangementClip(
      "1|1",
      "v64 C3 1|1\nv64 C3 1|2\nv64 C3 1|3\nv64 C3 1|4",
      "1:0.0",
    );

    await applyTransform(clipId, "velocity += 50 * cos(4t, 0.25, sync)");
    const notes = await readClipNotes(clipId);
    const velocities = extractVelocities(notes);

    expect(velocities).toHaveLength(4);
    expect(velocities[0]).toBe(64);
    expect(velocities[1]).toBe(14);
    expect(velocities[2]).toBe(64);
    expect(velocities[3]).toBe(114);
  });
});
