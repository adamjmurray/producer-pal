// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for transform context variables (note.*, clip.*, bar.*),
 * function arity validation, and scale-dependent functions (quant, step).
 * Uses: e2e-test-set - t8 is empty MIDI track
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- --testPathPattern ppal-clip-transforms-context
 */
import { describe, expect, it } from "vitest";
import {
  getToolWarnings,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import {
  applyTransform as applyTransformHelper,
  createArrangementClip as createArrangementClipHelper,
  createMidiClip as createMidiClipHelper,
  readClipNotes as readClipNotesHelper,
} from "./helpers/ppal-clip-transforms-test-helpers.ts";

const ctx = setupMcpTestContext();

/** Creates a MIDI clip with specified notes on the empty MIDI track. */
async function createMidiClip(
  sceneIndex: number,
  notes: string,
): Promise<string> {
  return createMidiClipHelper(ctx, sceneIndex, notes);
}

/** Reads clip notes as a string. */
async function readClipNotes(clipId: string): Promise<string> {
  return readClipNotesHelper(ctx, clipId);
}

/** Applies a transform to a clip and returns the raw result. */
async function applyTransform(
  clipId: string,
  transform: string,
): Promise<unknown> {
  return applyTransformHelper(ctx, clipId, transform);
}

/** Creates a MIDI arrangement clip with notes at given position. */
async function createArrangementClip(
  arrangementStart: string,
  notes: string,
  length: string,
): Promise<string> {
  return createArrangementClipHelper(ctx, arrangementStart, notes, length);
}

/** Sets or disables the Live Set scale. */
async function setScale(scale: string): Promise<void> {
  await ctx.client!.callTool({
    name: "ppal-update-live-set",
    arguments: { scale },
  });
  await sleep(100);
}

// =============================================================================
// Context Variable Tests
// =============================================================================

describe("ppal-clip-transforms (context variables)", () => {
  it("note.index creates sequential crescendo", async () => {
    const clipId = await createMidiClip(27, "v100 C3 1|1 C3 1|2 C3 1|3 C3 1|4");

    await applyTransform(clipId, "velocity = 60 + note.index * 10");
    const notes = await readClipNotes(clipId);

    const velocities = [...notes.matchAll(/v(\d+)/g)].map((m) => Number(m[1]));

    expect(velocities[0]).toBe(60); // index 0
    expect(velocities[1]).toBe(70); // index 1
    expect(velocities[2]).toBe(80); // index 2
    expect(velocities[3]).toBe(90); // index 3
  });

  it("clip.duration uses content length for session clips", async () => {
    // 2:0.0 = 8 beats in 4/4
    const clipId = await createMidiClip(28, "v100 C3 1|1");

    await applyTransform(clipId, "velocity = clip.duration * 10");
    const notes = await readClipNotes(clipId);

    expect(notes).toContain("v80"); // 8 beats * 10 = 80
  });

  it("clip.duration uses arrangement length for arrangement clips", async () => {
    // Create a 3:0.0 (12 beat) arrangement clip with a single note
    const clipId = await createArrangementClip("1|1", "v100 C3 1|1", "3:0.0");

    await applyTransform(clipId, "velocity = clip.duration * 10");
    const notes = await readClipNotes(clipId);

    // 12 arrangement beats * 10 = 120
    expect(notes).toContain("v120");
  });

  it("clip.barDuration reflects time signature", async () => {
    // Default 4/4, clip.barDuration = 4
    const clipId = await createMidiClip(29, "v100 C3 1|1");

    await applyTransform(clipId, "velocity = clip.barDuration * 20");
    const notes = await readClipNotes(clipId);

    expect(notes).toContain("v80"); // 4 * 20 = 80
  });

  it("clip.index differentiates between multiple clips", async () => {
    const clipId1 = await createMidiClip(30, "v100 C3 1|1");
    const clipId2 = await createMidiClip(31, "v100 C3 1|1");

    // Apply same transform to both clips via comma-separated ids
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: `${clipId1},${clipId2}`,
        transforms: "pitch += clip.index * 7",
      },
    });
    await sleep(100);

    const notes1 = await readClipNotes(clipId1);
    const notes2 = await readClipNotes(clipId2);

    // clip.index 0 => pitch unchanged (C3), clip.index 1 => +7 (G3)
    expect(notes1).toContain("C3");
    expect(notes2).toContain("G3");
  });

  it("clip.position warns on session clips", async () => {
    const clipId = await createMidiClip(32, "v100 C3 1|1");

    const result = await applyTransform(clipId, "velocity = clip.position");
    const warnings = getToolWarnings(result);

    expect(warnings.length).toBeGreaterThan(0);
  });

  it("note.count scales velocity based on total note count", async () => {
    const clipId = await createMidiClip(38, "v100 C3 1|1 C3 1|2 C3 1|3 C3 1|4");

    await applyTransform(clipId, "velocity = note.count * 20");
    const notes = await readClipNotes(clipId);

    // 4 notes * 20 = 80 (sticky velocity: v80 shown once, applied to all)
    expect(notes).toContain("v80");
    // Verify all 4 notes still present
    const pitches = [...notes.matchAll(/C3/g)];

    expect(pitches).toHaveLength(4);
  });

  it("clip.count reflects number of clips in multi-clip operation", async () => {
    const clipId1 = await createMidiClip(39, "v100 C3 1|1");
    const clipId2 = await createMidiClip(40, "v100 C3 1|1");

    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: `${clipId1},${clipId2}`,
        transforms: "velocity = clip.count * 30",
      },
    });
    await sleep(100);

    const notes1 = await readClipNotes(clipId1);
    const notes2 = await readClipNotes(clipId2);

    // clip.count = 2, so 2 * 30 = 60 for both clips
    expect(notes1).toContain("v60");
    expect(notes2).toContain("v60");
  });
});

// =============================================================================
// Arity Validation Tests
// =============================================================================

describe("ppal-clip-transforms (arity validation)", () => {
  it("warns on rand() with too many arguments", async () => {
    const clipId = await createMidiClip(33, "v80 C3 1|1");

    const result = await applyTransform(clipId, "velocity = rand(0, 100, 50)");
    const warnings = getToolWarnings(result);

    expect(warnings.length).toBeGreaterThan(0);
    // Original velocity should be unchanged
    const notes = await readClipNotes(clipId);

    expect(notes).toContain("v80");
  });

  it("warns on ramp() with too many arguments", async () => {
    const clipId = await createMidiClip(34, "v80 C3 1|1");

    const result = await applyTransform(
      clipId,
      "velocity = ramp(0, 100, 1, 2)",
    );
    const warnings = getToolWarnings(result);

    expect(warnings.length).toBeGreaterThan(0);
    const notes = await readClipNotes(clipId);

    expect(notes).toContain("v80");
  });
});

// =============================================================================
// Scale-Dependent Function Tests (quant)
// =============================================================================

describe("ppal-clip-transforms (quant)", () => {
  it("quantizes chromatic pitches to C Major scale", async () => {
    await setScale("C Major");

    // Create clip with out-of-scale notes (Db, Eb, Gb are not in C Major)
    const clipId = await createMidiClip(20, "C3 1|1 Db3 1|2 Eb3 1|3 Gb3 1|4");

    await applyTransform(clipId, "pitch = quant(note.pitch)");

    const notes = await readClipNotes(clipId);

    // C3(60) stays C3 (in scale)
    // Db3(61) → D3(62) (equidistant from C and D, prefer higher)
    // Eb3(63) → E3(64) (equidistant from D and E, prefer higher)
    // Gb3(66) → G3(67) (equidistant from F and G, prefer higher)
    expect(notes).toContain("C3");
    expect(notes).toContain("D3");
    expect(notes).toContain("E3");
    expect(notes).toContain("G3");
    expect(notes).not.toContain("Db3");
    expect(notes).not.toContain("Eb3");
    expect(notes).not.toContain("Gb3");
  });

  it("is a no-op when no scale is active", async () => {
    await setScale("");

    const clipId = await createMidiClip(21, "Db3 1|1 Eb3 1|2");

    await applyTransform(clipId, "pitch = quant(note.pitch)");

    const notes = await readClipNotes(clipId);

    // Notes should remain unchanged — no scale means quant is a no-op
    expect(notes).toContain("Db3");
    expect(notes).toContain("Eb3");
  });
});

// =============================================================================
// Scale-Dependent Function Tests (step)
// =============================================================================

describe("ppal-clip-transforms (step)", () => {
  it("steps up scale degrees in C Major", async () => {
    await setScale("C Major");

    // Create clip with C3, step up 2 scale degrees → E3
    const clipId = await createMidiClip(50, "C3 1|1");

    await applyTransform(clipId, "pitch = step(note.pitch, 2)");

    const notes = await readClipNotes(clipId);

    // C3(60) + 2 scale steps in C Major → E3(64)
    expect(notes).toContain("E3");
    expect(notes).not.toContain("C3");
  });

  it("steps down scale degrees", async () => {
    await setScale("C Major");

    const clipId = await createMidiClip(51, "E3 1|1");

    await applyTransform(clipId, "pitch = step(note.pitch, -2)");

    const notes = await readClipNotes(clipId);

    // E3(64) - 2 scale steps in C Major → C3(60)
    expect(notes).toContain("C3");
    expect(notes).not.toContain("E3");
  });

  it("skips non-scale degrees in pentatonic", async () => {
    await setScale("C Minor");

    const clipId = await createMidiClip(52, "C3 1|1");

    // In C Minor (C D Eb F G Ab Bb), step 1 from C → D, step 2 → Eb
    await applyTransform(clipId, "pitch = step(note.pitch, 2)");

    const notes = await readClipNotes(clipId);

    expect(notes).toContain("Eb3");
  });

  it("is chromatic fallback when no scale is active", async () => {
    await setScale("");

    const clipId = await createMidiClip(53, "C3 1|1");

    await applyTransform(clipId, "pitch = step(note.pitch, 3)");

    const notes = await readClipNotes(clipId);

    // No scale → chromatic: C3(60) + 3 = Eb3(63)
    expect(notes).toContain("Eb3");
  });
});
