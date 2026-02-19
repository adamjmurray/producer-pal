// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for waveform phase behavior in transforms.
 * Verifies that each waveform produces correct values at key phase points.
 * Uses: e2e-test-set - t8 is empty MIDI track
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-clip-transforms-waveforms
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";

const ctx = setupMcpTestContext();

const emptyMidiTrack = 8; // t8 "9-MIDI" from e2e-test-set

/** Creates a MIDI clip with 4 notes at beats 1|1-1|4 for waveform testing. */
async function createWaveformClip(sceneIndex: number): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: {
      view: "session",
      trackIndex: emptyMidiTrack,
      sceneIndex: String(sceneIndex),
      notes: "v64 C3 1|1\nv64 C3 1|2\nv64 C3 1|3\nv64 C3 1|4",
      length: "1:0.0",
    },
  });
  const clip = parseToolResult<CreateClipResult>(result);

  await sleep(100);

  return clip.id;
}

/** Applies a transform and returns the notes string. */
async function applyAndReadNotes(
  clipId: string,
  transform: string,
): Promise<string> {
  await ctx.client!.callTool({
    name: "ppal-update-clip",
    arguments: { ids: clipId, transforms: transform },
  });
  await sleep(100);

  const result = await ctx.client!.callTool({
    name: "ppal-read-clip",
    arguments: { clipId, include: ["notes"] },
  });
  const clip = parseToolResult<ReadClipResult>(result);

  return clip.notes ?? "";
}

/** Extracts velocity values from notes string (only finds explicit v markers). */
function extractVelocities(notes: string): number[] {
  return [...notes.matchAll(/v(\d+)/g)].map((m) => Number(m[1]));
}

// All waveforms use: velocity = 64 + 50 * waveform(4t)
// 4 notes at phases 0, 0.25, 0.5, 0.75

describe("ppal-clip-transforms-waveforms", () => {
  it("cos() starts at peak (1.0)", async () => {
    const clipId = await createWaveformClip(36);

    // cos: phase 0→1, 0.25→0, 0.5→-1, 0.75→0
    // velocity: 114, 64, 14, 64
    const velocities = extractVelocities(
      await applyAndReadNotes(clipId, "velocity = 64 + 50 * cos(4t)"),
    );

    expect(velocities).toHaveLength(4);
    expect(velocities[0]).toBe(114);
    expect(velocities[1]).toBe(64);
    expect(velocities[2]).toBe(14);
    expect(velocities[3]).toBe(64);
  });

  // sin and tri have identical phase behavior: 0→0, 0.25→1, 0.5→0, 0.75→-1
  // velocity: 64, 114, 64, 14
  it.each([
    { waveform: "sin", scene: 37 },
    { waveform: "tri", scene: 38 },
  ])(
    "$waveform() starts at zero, rises to peak",
    async ({ waveform, scene }) => {
      const clipId = await createWaveformClip(scene);

      const velocities = extractVelocities(
        await applyAndReadNotes(clipId, `velocity = 64 + 50 * ${waveform}(4t)`),
      );

      expect(velocities).toHaveLength(4);
      expect(velocities[0]).toBe(64);
      expect(velocities[1]).toBe(114);
      expect(velocities[2]).toBe(64);
      expect(velocities[3]).toBe(14);
    },
  );

  it("saw() starts at zero, rises to peak then jumps", async () => {
    const clipId = await createWaveformClip(39);

    // saw: phase 0→0, 0.25→0.5, 0.5→-1, 0.75→-0.5
    // velocity: 64, 89, 14, 39
    const velocities = extractVelocities(
      await applyAndReadNotes(clipId, "velocity = 64 + 50 * saw(4t)"),
    );

    expect(velocities).toHaveLength(4);
    expect(velocities[0]).toBe(64);
    expect(velocities[1]).toBe(89);
    expect(velocities[2]).toBe(14);
    expect(velocities[3]).toBe(39);
  });

  it("square() starts at peak (1.0)", async () => {
    const clipId = await createWaveformClip(40);

    // square: phase 0→1, 0.25→1, 0.5→-1, 0.75→-1
    // velocity: 114, 114, 14, 14
    // Note: notation format uses state changes, so consecutive identical
    // velocities aren't repeated. Check pattern instead of counting v markers.
    const notes = await applyAndReadNotes(
      clipId,
      "velocity = 64 + 50 * square(4t)",
    );

    // First two notes at v114 (high), last two at v14 (low)
    expect(notes).toMatch(/^v114\b/);
    expect(notes).toMatch(/v14\b.*1\|3/);
    expect(notes).not.toMatch(/v64/); // No notes at mid-velocity
  });
});
