// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for clip transforms (audio gain and MIDI parameters)
 * Tests transform expressions applied via ppal-update-clip and ppal-create-clip.
 * Uses: e2e-test-set - t8 is empty MIDI track
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  type CreateTrackResult,
  getToolWarnings,
  parseToolResult,
  type ReadClipResult,
  SAMPLE_FILE,
  setupMcpTestContext,
  sleep,
  type UpdateClipResult,
} from "../mcp-test-helpers.ts";
import {
  applyTransform as applyTransformHelper,
  createMidiClip as createMidiClipHelper,
  emptyMidiTrack,
  readClipNotes as readClipNotesHelper,
} from "./helpers/ppal-clip-transforms-test-helpers.ts";

const ctx = setupMcpTestContext();

/** Creates an audio track with a clip for testing. */
async function createAudioTrackWithClip(trackName: string): Promise<{
  trackIndex: number;
  clipId: string;
}> {
  const trackResult = await ctx.client!.callTool({
    name: "ppal-create-track",
    arguments: { type: "audio", name: trackName },
  });
  const track = parseToolResult<CreateTrackResult>(trackResult);

  await sleep(100);

  const clipResult = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: {
      view: "session",
      trackIndex: track.trackIndex,
      sceneIndex: "0",
      sampleFile: SAMPLE_FILE,
    },
  });
  const clip = parseToolResult<CreateClipResult>(clipResult);

  await sleep(100);

  return { trackIndex: track.trackIndex!, clipId: clip.id };
}

/** Reads clip and returns gainDb value. */
async function readClipGain(clipId: string): Promise<number> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-clip",
    arguments: { clipId, include: ["sample"] },
  });
  const clip = parseToolResult<ReadClipResult>(result);

  return clip.gainDb ?? 0;
}

/** Reads clip and returns pitchShift value. */
async function readClipPitchShift(clipId: string): Promise<number> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-clip",
    arguments: { clipId, include: ["sample"] },
  });
  const clip = parseToolResult<ReadClipResult>(result);

  return clip.pitchShift!;
}

/** Applies a transform to a clip. Returns the raw result for warning inspection. */
async function applyTransform(
  clipId: string,
  transform: string,
): Promise<unknown> {
  return applyTransformHelper(ctx, clipId, transform);
}

// =============================================================================
// Audio Transform Tests (update-clip)
// =============================================================================

describe("ppal-clip-transforms (audio gain)", () => {
  it("applies gain transforms with expressions and clamping", async () => {
    const { clipId } = await createAudioTrackWithClip("Gain Comprehensive");

    // Constants: -6 dB
    await applyTransform(clipId, "gain = -6");
    expect(await readClipGain(clipId)).toBeCloseTo(-6, 0);

    // Expression with multiplication: -6 * 2 = -12
    await applyTransform(clipId, "gain = -6 * 2");
    expect(await readClipGain(clipId)).toBeCloseTo(-12, 0);

    // Self-reference: audio.gain + 6 = -12 + 6 = -6
    await applyTransform(clipId, "gain = audio.gain + 6");
    expect(await readClipGain(clipId)).toBeCloseTo(-6, 0);

    // Add operator: -6 + 4 = -2 (using +=)
    await applyTransform(clipId, "gain += 4");
    expect(await readClipGain(clipId)).toBeCloseTo(-2, 0);

    // Division: -12 / 2 = -6
    await applyTransform(clipId, "gain = -12 / 2");
    expect(await readClipGain(clipId)).toBeCloseTo(-6, 0);

    // Clamping below minimum: -100 → -70
    await applyTransform(clipId, "gain = -100");
    expect(await readClipGain(clipId)).toBeCloseTo(-70, 0);

    // Clamping above maximum: 50 → 24
    await applyTransform(clipId, "gain = 50");
    expect(await readClipGain(clipId)).toBeCloseTo(24, 0);

    // Curve: logarithmic fade in from -24 to 0
    await applyTransform(clipId, "gain = curve(-24, 0, 0.5)");
    const curveGain = await readClipGain(clipId);

    expect(curveGain).toBeGreaterThanOrEqual(-24);
    expect(curveGain).toBeLessThanOrEqual(0);
  });
});

describe("ppal-clip-transforms (audio pitchShift)", () => {
  it("applies pitchShift transforms with expressions and clamping", async () => {
    const { clipId } = await createAudioTrackWithClip(
      "PitchShift Comprehensive",
    );

    // Constant: 5 semitones
    await applyTransform(clipId, "pitchShift = 5");
    expect(await readClipPitchShift(clipId)).toBeCloseTo(5, 1);

    // Decimal value: 5.5 semitones
    await applyTransform(clipId, "pitchShift = 5.5");
    expect(await readClipPitchShift(clipId)).toBeCloseTo(5.5, 1);

    // Add operator: 5.5 + 2 = 7.5
    await applyTransform(clipId, "pitchShift += 2");
    expect(await readClipPitchShift(clipId)).toBeCloseTo(7.5, 1);

    // Self-reference: pitchShift * 2 = 15
    await applyTransform(clipId, "pitchShift = audio.pitchShift * 2");
    expect(await readClipPitchShift(clipId)).toBeCloseTo(15, 1);

    // Clamping below minimum: -60 → -48
    await applyTransform(clipId, "pitchShift = -60");
    expect(await readClipPitchShift(clipId)).toBeCloseTo(-48, 1);

    // Clamping above maximum: 60 → 48
    await applyTransform(clipId, "pitchShift = 60");
    expect(await readClipPitchShift(clipId)).toBeCloseTo(48, 1);
  });
});

describe("ppal-clip-transforms (audio multi-clip and combined)", () => {
  it("applies transforms to multiple clips and combined params", async () => {
    const trackResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "audio", name: "Multi Clip Combined" },
    });
    const track = parseToolResult<CreateTrackResult>(trackResult);

    await sleep(100);

    // Create two clips on different scenes
    const clip1Result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: track.trackIndex,
        sceneIndex: "0",
        sampleFile: SAMPLE_FILE,
      },
    });
    const clip1 = parseToolResult<CreateClipResult>(clip1Result);

    const clip2Result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: track.trackIndex,
        sceneIndex: "1",
        sampleFile: SAMPLE_FILE,
      },
    });
    const clip2 = parseToolResult<CreateClipResult>(clip2Result);

    await sleep(100);

    // Apply transform to both clips
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: `${clip1.id},${clip2.id}`, transforms: "gain = -9" },
    });
    await sleep(100);

    expect(await readClipGain(clip1.id)).toBeCloseTo(-9, 0);
    expect(await readClipGain(clip2.id)).toBeCloseTo(-9, 0);

    // Combined gain + pitchShift
    await applyTransform(clip1.id, "gain = -6\npitchShift = 5");
    expect(await readClipGain(clip1.id)).toBeCloseTo(-6, 0);
    expect(await readClipPitchShift(clip1.id)).toBeCloseTo(5, 1);

    // rand() function: result should be in range [-10, 0]
    await applyTransform(clip1.id, "gain = -5 + 5 * rand()");
    const gain = await readClipGain(clip1.id);

    expect(gain).toBeGreaterThanOrEqual(-10);
    expect(gain).toBeLessThanOrEqual(0);
  });
});

// =============================================================================
// MIDI Transform Tests (update-clip)
// =============================================================================

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

describe("ppal-clip-transforms (midi velocity)", () => {
  it("transforms velocity with expressions and clamping", async () => {
    const clipId = await createMidiClip(0, "v100 C3 1|1");

    // Set to constant
    await applyTransform(clipId, "velocity = 64");
    let notes = await readClipNotes(clipId);

    expect(notes).toContain("v64");

    // Use += operator (64 + 20 = 84)
    await applyTransform(clipId, "velocity += 20");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("v84");

    // Clamp above maximum (200 → 127)
    await applyTransform(clipId, "velocity = 200");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("v127");

    // Velocity below 1 deletes the note
    await applyTransform(clipId, "velocity = 0");
    notes = await readClipNotes(clipId);
    expect(notes).toBe("");
  });
});

describe("ppal-clip-transforms (midi timing and duration)", () => {
  it("transforms timing and duration", async () => {
    const clipId = await createMidiClip(1, "C3 1|1");

    // Timing: shift forward by 0.5 beats
    await applyTransform(clipId, "timing += 0.5");
    let notes = await readClipNotes(clipId);

    expect(notes).toContain("1|1.5");

    // Timing: shift backward
    await applyTransform(clipId, "timing += -0.25");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("1|1.25");

    // Duration: set to 2 beats
    await applyTransform(clipId, "duration = 2");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("t2");

    // Duration: multiply (set to 0.5)
    await applyTransform(clipId, "duration = 0.5");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("t0.5");

    // Duration below 0 deletes the note
    await applyTransform(clipId, "duration = -1");
    notes = await readClipNotes(clipId);
    expect(notes).toBe("");
  });
});

describe("ppal-clip-transforms (midi probability and deviation)", () => {
  it("transforms probability and deviation", async () => {
    const clipId = await createMidiClip(2, "v100 C3 1|1");

    // Probability: set to 0.8
    await applyTransform(clipId, "probability = 0.8");
    let notes = await readClipNotes(clipId);

    expect(notes).toContain("p0.8");

    // Probability: clamp above 1.0
    await applyTransform(clipId, "probability = 1.5");
    notes = await readClipNotes(clipId);
    expect(notes).not.toContain("p1.5"); // At p1.0, format omits probability

    // Probability: clamp below 0.0
    await applyTransform(clipId, "probability = -0.5");
    notes = await readClipNotes(clipId);
    expect(notes).toMatch(/p0(?:\.0+)?(?:\s|$)/);

    // Deviation: set to 20 (shows as velocity range v100-120)
    await applyTransform(clipId, "probability = 1"); // Reset probability
    await applyTransform(clipId, "deviation = 20");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("v100-120");

    // Deviation: clamp above 127
    await applyTransform(clipId, "deviation = 200");
    notes = await readClipNotes(clipId);
    expect(notes).toMatch(/v100-\d+/);
  });
});

describe("ppal-clip-transforms (midi pitch)", () => {
  it("transforms pitch with expressions, literals, and clamping", async () => {
    const clipId = await createMidiClip(3, "C3 1|1");

    // Constant: set to pitch 72 (C4)
    await applyTransform(clipId, "pitch = 72");
    let notes = await readClipNotes(clipId);

    expect(notes).toContain("C4");

    // Operator: transpose up by octave (C4 + 12 = C5)
    await applyTransform(clipId, "pitch += 12");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("C5");

    // Pitch literal: set to C4
    await applyTransform(clipId, "pitch = C4");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("C4");

    // Pitch literal with sharp: F#3 (system returns flats)
    await applyTransform(clipId, "pitch = F#3");
    notes = await readClipNotes(clipId);
    expect(notes).toMatch(/F#3|Gb3/);

    // Pitch literal with flat: Bb2
    await applyTransform(clipId, "pitch = Bb2");
    notes = await readClipNotes(clipId);
    expect(notes).toMatch(/A#2|Bb2/);

    // Arithmetic: F#3 + 7 = 66 + 7 = 73 (C#4/Db4)
    await applyTransform(clipId, "pitch = F#3 + 7");
    notes = await readClipNotes(clipId);
    expect(notes).toMatch(/C#4|Db4/);

    // Self-reference: note.pitch + 7 (73 + 7 = 80 = G#4/Ab4)
    await applyTransform(clipId, "pitch = note.pitch + 7");
    notes = await readClipNotes(clipId);
    expect(notes).toMatch(/G#4|Ab4/);

    // Rounding: 60.7 rounds to 61 (C#3/Db3)
    await applyTransform(clipId, "pitch = 60.7");
    notes = await readClipNotes(clipId);
    expect(notes).toMatch(/C#3|Db3/);

    // Clamp below minimum: -10 → 0 (C-2)
    await applyTransform(clipId, "pitch = -10");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("C-2");

    // Clamp above maximum: 200 → 127 (G8)
    await applyTransform(clipId, "pitch = 200");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("G8");
  });
});

describe("ppal-clip-transforms (selectors and multi-note)", () => {
  it("applies transforms with selectors and multi-note", async () => {
    // Multi-note: transpose C major triad
    const clipId1 = await createMidiClip(4, "C3 E3 G3 1|1");

    await applyTransform(clipId1, "pitch += 2");
    let notes = await readClipNotes(clipId1);

    expect(notes).toContain("D3");
    expect(notes).toMatch(/F#3|Gb3/);
    expect(notes).toContain("A3");
    expect(notes).not.toContain("C3");

    // Pitch selector: only transpose C3 (verify transformed count)
    const clipId2 = await createMidiClip(5, "C3 1|1\nE3 1|2");
    const u2 = parseToolResult<UpdateClipResult>(
      await applyTransform(clipId2, "C3: pitch += 12"),
    );

    notes = await readClipNotes(clipId2);
    expect(notes).toContain("C4"); // C3 became C4
    expect(notes).toContain("E3"); // E3 unchanged
    expect(u2.transformed).toBe(1); // Only C3 matched

    // Time selector: only transpose notes in beats 1-2
    const clipId3 = await createMidiClip(6, "C3 1|1\nC3 1|3");
    const u3 = parseToolResult<UpdateClipResult>(
      await applyTransform(clipId3, "1|1-1|2: pitch += 12"),
    );

    notes = await readClipNotes(clipId3);
    expect(notes).toContain("C4 1|1"); // Transposed
    expect(notes).toContain("C3 1|3"); // Unchanged
    expect(u3.transformed).toBe(1); // Only note at 1|1 matched
  });
});

// =============================================================================
// Math Function Tests
// =============================================================================

describe("ppal-clip-transforms (math functions)", () => {
  it("uses math functions for value manipulation", async () => {
    // max(): enforce minimum velocity
    let clipId = await createMidiClip(7, "v40 C3 1|1");

    await applyTransform(clipId, "velocity = max(60, note.velocity)");
    let notes = await readClipNotes(clipId);

    expect(notes).toContain("v60"); // max(60, 40) = 60

    // min(): cap maximum velocity
    clipId = await createMidiClip(8, "v120 C3 1|1");
    await applyTransform(clipId, "velocity = min(95, note.velocity)");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("v95"); // min(95, 120) = 95

    // floor(): quantize to steps
    clipId = await createMidiClip(9, "v67 C3 1|1");
    await applyTransform(clipId, "velocity = floor(note.velocity / 10) * 10");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("v60"); // floor(6.7) * 10 = 60

    // round(): round to steps
    clipId = await createMidiClip(10, "v67 C3 1|1");
    await applyTransform(clipId, "velocity = round(note.velocity / 10) * 10");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("v70"); // round(6.7) * 10 = 70

    // abs(): absolute value
    clipId = await createMidiClip(11, "v100 C3 1|1");
    await applyTransform(clipId, "velocity = abs(-50)");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("v50");

    // ceil(): round up to steps
    clipId = await createMidiClip(12, "v63 C3 1|1");
    await applyTransform(clipId, "velocity = ceil(note.velocity / 10) * 10");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("v70"); // ceil(6.3) * 10 = 70

    // pow(): exponential scaling
    clipId = await createMidiClip(25, "v100 C3 1|1");
    await applyTransform(clipId, "velocity = pow(3, 2)");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("v9"); // 3^2 = 9

    // Nested: max(60, min(100, value))
    clipId = await createMidiClip(26, "v50 C3 1|1");
    await applyTransform(clipId, "velocity = max(60, min(100, note.velocity))");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("v60"); // max(60, 50) = 60

    // clamp(): constrain to range
    clipId = await createMidiClip(35, "v30 C3 1|1");
    await applyTransform(clipId, "velocity = clamp(note.velocity, 50, 100)");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("v50"); // clamp(30, 50, 100) = 50

    // clamp(): value within range passes through
    clipId = await createMidiClip(36, "v75 C3 1|1");
    await applyTransform(clipId, "velocity = clamp(note.velocity, 50, 100)");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("v75"); // clamp(75, 50, 100) = 75

    // clamp(): swapped bounds auto-corrected
    clipId = await createMidiClip(37, "v75 C3 1|1");
    await applyTransform(clipId, "velocity = clamp(note.velocity, 100, 50)");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("v75"); // bounds sorted, clamp(75, 50, 100) = 75
  });

  it("uses modulo operator", async () => {
    const { clipId } = await createAudioTrackWithClip("Modulo Pattern");

    // Basic modulo patterns
    await applyTransform(clipId, "gain = -6 * (0 % 2)");
    expect(await readClipGain(clipId)).toBeCloseTo(0, 0); // 0 % 2 = 0

    await applyTransform(clipId, "gain = -6 * (1 % 2)");
    expect(await readClipGain(clipId)).toBeCloseTo(-6, 0); // 1 % 2 = 1

    // Negative wraparound: -1 % 4 = 3
    await applyTransform(clipId, "gain = -1 * (-1 % 4)");
    expect(await readClipGain(clipId)).toBeCloseTo(-3, 0);

    // Standard modulo: 10 % 3 = 1
    await applyTransform(clipId, "gain = 10 % 3");
    expect(await readClipGain(clipId)).toBeCloseTo(1, 0);
  });
});

// =============================================================================
// Cross-Type Transform Tests
// =============================================================================

describe("ppal-clip-transforms (cross-type handling)", () => {
  it("ignores MIDI transforms on audio clips with warnings", async () => {
    const { clipId } = await createAudioTrackWithClip("Audio Ignore MIDI");

    await applyTransform(clipId, "gain = -6");
    expect(await readClipGain(clipId)).toBeCloseTo(-6, 0);

    // Apply MIDI-only transform - should emit warning, gain unchanged
    let result = await applyTransform(clipId, "velocity = 64");
    let warnings = getToolWarnings(result);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.toLowerCase().includes("velocity"))).toBe(
      true,
    );
    expect(await readClipGain(clipId)).toBeCloseTo(-6, 0);

    // Apply pitch transform - should emit warning (pitch is MIDI-only)
    result = await applyTransform(clipId, "pitch += 12");
    warnings = getToolWarnings(result);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.toLowerCase().includes("pitch"))).toBe(true);
    expect(await readClipGain(clipId)).toBeCloseTo(-6, 0);

    // Mixed transform - gain should apply, velocity ignored with warning
    result = await applyTransform(clipId, "velocity = 100\ngain = -12");
    warnings = getToolWarnings(result);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.toLowerCase().includes("velocity"))).toBe(
      true,
    );
    expect(await readClipGain(clipId)).toBeCloseTo(-12, 0);
  });

  it("ignores gain transforms on MIDI clips with warnings", async () => {
    const clipId = await createMidiClip(13, "v80 C3 1|1");

    const result = await applyTransform(clipId, "gain = -6");
    const warnings = getToolWarnings(result);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.toLowerCase().includes("gain"))).toBe(true);

    const notes = await readClipNotes(clipId);

    expect(notes).toContain("v80");
    expect(notes).toContain("C3");
  });

  it("ignores note.* variables in audio context with warnings", async () => {
    const { clipId } = await createAudioTrackWithClip("Audio Note Var");

    await applyTransform(clipId, "gain = -6");
    expect(await readClipGain(clipId)).toBeCloseTo(-6, 0);

    const result = await applyTransform(clipId, "gain = note.pitch");
    const warnings = getToolWarnings(result);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.toLowerCase().includes("note"))).toBe(true);
    expect(await readClipGain(clipId)).toBeCloseTo(-6, 0);
  });

  it("ignores audio.* variables in MIDI context with warnings", async () => {
    const clipId = await createMidiClip(14, "v80 C3 1|1");

    const result = await applyTransform(clipId, "velocity = audio.gain");
    const warnings = getToolWarnings(result);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.toLowerCase().includes("audio"))).toBe(true);

    const notes = await readClipNotes(clipId);

    expect(notes).toContain("v80");
    expect(notes).toContain("C3");
  });
});

// =============================================================================
// Create-Clip Transform Tests
// =============================================================================

describe("ppal-clip-transforms (create-clip)", () => {
  it("creates MIDI clips with transforms applied", async () => {
    // Create clip with velocity transform
    const result1 = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: emptyMidiTrack,
        sceneIndex: "15",
        notes: "v100 C3 1|1",
        length: "2:0.0",
        transforms: "velocity = 64",
      },
    });
    const clip1 = parseToolResult<CreateClipResult>(result1);

    await sleep(100);
    let notes = await readClipNotes(clip1.id);

    expect(notes).toContain("v64"); // Velocity transformed from 100 to 64
    expect(clip1.transformed).toBe(1); // No selector = all notes

    // Create clip with pitch transform (transposition)
    const result2 = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: emptyMidiTrack,
        sceneIndex: "16",
        notes: "C3 E3 G3 1|1", // C major triad
        length: "2:0.0",
        transforms: "pitch += 2", // Transpose to D major
      },
    });
    const clip2 = parseToolResult<CreateClipResult>(result2);

    await sleep(100);
    notes = await readClipNotes(clip2.id);

    expect(notes).toContain("D3");
    expect(notes).toMatch(/F#3|Gb3/);
    expect(notes).toContain("A3");
    expect(clip2.noteCount).toBe(3);
    expect(clip2.transformed).toBe(3); // All 3 notes transposed

    // Create clip with combined transforms
    const result3 = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: emptyMidiTrack,
        sceneIndex: "17",
        notes: "v100 C3 1|1",
        length: "2:0.0",
        transforms: "velocity = 80\npitch += 12",
      },
    });
    const clip3 = parseToolResult<CreateClipResult>(result3);

    await sleep(100);
    notes = await readClipNotes(clip3.id);

    expect(notes).toContain("v80");
    expect(notes).toContain("C4"); // Transposed up an octave
  });

  it("creates MIDI clips with selector transforms", async () => {
    // Create clip with pitch selector (only transpose C3)
    const result1 = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: emptyMidiTrack,
        sceneIndex: "18",
        notes: "C3 1|1\nE3 1|2",
        length: "2:0.0",
        transforms: "C3: pitch += 12",
      },
    });
    const clip1 = parseToolResult<CreateClipResult>(result1);

    await sleep(100);
    let notes = await readClipNotes(clip1.id);

    expect(notes).toContain("C4"); // C3 became C4
    expect(notes).toContain("E3"); // E3 unchanged
    expect(clip1.transformed).toBe(1); // Only C3 matched the selector

    // Create clip with time selector
    const result2 = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: emptyMidiTrack,
        sceneIndex: "19",
        notes: "C3 1|1\nC3 1|3",
        length: "2:0.0",
        transforms: "1|1-1|2: velocity = 64",
      },
    });
    const clip2 = parseToolResult<CreateClipResult>(result2);

    await sleep(100);
    notes = await readClipNotes(clip2.id);

    expect(notes).toContain("v64"); // First note has transformed velocity
    // Second note at 1|3 should have default velocity (no v prefix shown)
    expect(notes).toMatch(/C3 1\|3/); // Second note unchanged
    expect(clip2.noteCount).toBe(2);
    expect(clip2.transformed).toBe(1); // Only note at 1|1 matched the time selector
  });
});

// =============================================================================
// Randomization and Curve Function Tests
// =============================================================================

describe("ppal-clip-transforms (rand, choose, curve)", () => {
  it("rand() randomizes velocity within default range [-1, 1]", async () => {
    const clipId = await createMidiClip(20, "v100 C3 1|1 C3 1|2 C3 1|3 C3 1|4");

    await applyTransform(clipId, "velocity += 10 * rand()");
    const notes = await readClipNotes(clipId);

    // Each note should have velocity in [90, 110] (100 ± 10)
    const velocities = [...notes.matchAll(/v(\d+)/g)].map((m) => Number(m[1]));

    for (const v of velocities) {
      expect(v).toBeGreaterThanOrEqual(90);
      expect(v).toBeLessThanOrEqual(110);
    }
  });

  it("rand(min, max) randomizes within specified range", async () => {
    const clipId = await createMidiClip(21, "v100 C3 1|1 C3 1|2 C3 1|3 C3 1|4");

    await applyTransform(clipId, "velocity = rand(60, 120)");
    const notes = await readClipNotes(clipId);

    const velocities = [...notes.matchAll(/v(\d+)/g)].map((m) => Number(m[1]));

    for (const v of velocities) {
      expect(v).toBeGreaterThanOrEqual(60);
      expect(v).toBeLessThanOrEqual(120);
    }

    // Nested: round(rand()) for integer random transpose
    await applyTransform(clipId, "pitch = 60 + round(rand(0, 12))");
    const transposedNotes = await readClipNotes(clipId);
    const pitchMatches = [...transposedNotes.matchAll(/([A-G][#b]?\d)/g)];

    // All pitches should be C3 (60) through C4 (72)
    expect(pitchMatches.length).toBeGreaterThan(0);

    // Duration with rand and multiply operator
    await applyTransform(clipId, "duration = rand(0.5, 1.5)");
    const durNotes = await readClipNotes(clipId);
    const durations = [...durNotes.matchAll(/t([\d.]+)/g)].map((m) =>
      Number(m[1]),
    );

    for (const d of durations) {
      expect(d).toBeGreaterThanOrEqual(0.5);
      expect(d).toBeLessThanOrEqual(1.5);
    }

    // square() with custom pulse width: high for 75% of cycle, low for 25%
    // Phases 0, 0.25, 0.5 → high (v114), phase 0.75 → low (v14)
    await applyTransform(clipId, "velocity = 64 + 50 * square(4t, 0, 0.75)");
    const sqNotes = await readClipNotes(clipId);

    // Note format uses state changes: v114 at start, v14 only at beat 1|4
    expect(sqNotes).toMatch(/^v114\b/); // first 3 notes are high
    expect(sqNotes).toMatch(/v14\b.*1\|4/); // last note is low
  });

  it("choose() selects from provided values", async () => {
    const clipId = await createMidiClip(22, "v99 C3 1|1 C3 1|2 C3 1|3 C3 1|4");

    await applyTransform(clipId, "velocity = choose(60, 80, 100, 120)");
    const notes = await readClipNotes(clipId);

    const velocities = [...notes.matchAll(/v(\d+)/g)].map((m) => Number(m[1]));
    const validChoices = [60, 80, 100, 120];

    for (const v of velocities) {
      expect(validChoices).toContain(v);
    }
  });

  it("curve() applies exponential shape over clip duration", async () => {
    const clipId = await createMidiClip(
      23,
      "v100 C3 1|1 C3 1|2 C3 1|3 C3 1|4 C3 2|1 C3 2|2 C3 2|3 C3 2|4",
    );

    // Exponent 2: slow start, fast end
    // 8 notes at positions 0-7, clip range 0-8: v = 40 + 80 * (pos/8)^2
    await applyTransform(clipId, "velocity = curve(40, 120, 2)");
    const notes = await readClipNotes(clipId);

    const velocities = [...notes.matchAll(/v(\d+)/g)].map((m) => Number(m[1]));

    expect(velocities).toStrictEqual([40, 41, 45, 51, 60, 71, 85, 101]);
  });

  it("curve() with exponent < 1 applies logarithmic shape", async () => {
    const clipId = await createMidiClip(
      24,
      "v100 C3 1|1 C3 1|2 C3 1|3 C3 1|4 C3 2|1 C3 2|2 C3 2|3 C3 2|4",
    );

    // Exponent 0.5: fast start, slow end
    // 8 notes at positions 0-7, clip range 0-8: v = 40 + 80 * sqrt(pos/8)
    await applyTransform(clipId, "velocity = curve(40, 120, 0.5)");
    const notes = await readClipNotes(clipId);

    const velocities = [...notes.matchAll(/v(\d+)/g)].map((m) => Number(m[1]));

    expect(velocities).toStrictEqual([40, 68, 80, 89, 97, 103, 109, 115]);
  });

  it("ramp() reaches end value on last 16th note with N|4.75 endpoint", async () => {
    // 16 sixteenth notes across 1 bar
    const clipId = await createMidiClip(41, "t/4 C3 1|1x16");

    // Time filter ends on the last 16th note's start position (1|4.75)
    await applyTransform(clipId, "1|1-1|4.75: velocity = ramp(20, 127)");
    const notes = await readClipNotes(clipId);

    // ramp(20, 127) over range 0-3.75 beats: each 16th note gets a unique velocity
    const velocities = [...notes.matchAll(/v(\d+)/g)].map((m) => Number(m[1]));

    // Linear ramp: v = 20 + 107 * (pos / 3.75), rounded to integer
    expect(velocities).toStrictEqual([
      20, 27, 34, 41, 49, 56, 63, 70, 77, 84, 91, 98, 106, 113, 120, 127,
    ]);
  });

  it("curve() reaches end value on last 16th note with N|4.75 endpoint", async () => {
    // 16 sixteenth notes across 1 bar
    const clipId = await createMidiClip(42, "t/4 C3 1|1x16");

    // Time filter ends on the last 16th note's start position (1|4.75)
    await applyTransform(clipId, "1|1-1|4.75: velocity = curve(20, 127, 2)");
    const notes = await readClipNotes(clipId);

    // curve(20, 127, 2): v = 20 + 107 * (pos/3.75)^2, rounded to integer
    // Notes 0 and 1 both round to v20, so the state-change format emits 15 v tokens
    const velocities = [...notes.matchAll(/v(\d+)/g)].map((m) => Number(m[1]));

    expect(velocities).toStrictEqual([
      20, 22, 24, 28, 32, 37, 43, 50, 59, 68, 78, 88, 100, 113, 127,
    ]);
  });
});

// =============================================================================
// seq() Tests
// =============================================================================

describe("ppal-clip-transforms (seq)", () => {
  it("seq() cycles velocity through values per note", async () => {
    const clipId = await createMidiClip(43, "v100 C3 1|1 C3 1|2 C3 1|3 C3 1|4");

    await applyTransform(clipId, "velocity = seq(60, 80, 100, 120)");
    const notes = await readClipNotes(clipId);
    const velocities = [...notes.matchAll(/v(\d+)/g)].map((m) => Number(m[1]));

    expect(velocities).toStrictEqual([60, 80, 100, 120]);
  });

  it("seq() wraps around when note count exceeds arg count", async () => {
    // 6 notes with 3-value seq: should produce 60,80,100,60,80,100
    const clipId = await createMidiClip(
      44,
      "v100 C3 1|1 C3 1|1.5 C3 1|2 C3 1|2.5 C3 1|3 C3 1|3.5",
    );

    await applyTransform(clipId, "velocity = seq(60, 80, 100)");
    const notes = await readClipNotes(clipId);
    const velocities = [...notes.matchAll(/v(\d+)/g)].map((m) => Number(m[1]));

    expect(velocities).toStrictEqual([60, 80, 100, 60, 80, 100]);
  });

  it("seq() works with nested expressions", async () => {
    // seq of 2 values wrapping over 4 notes → 40,120,40,120
    const clipId = await createMidiClip(45, "v100 C3 1|1 C3 1|2 C3 1|3 C3 1|4");

    await applyTransform(clipId, "velocity = seq(20 + 20, 60 * 2)");
    const notes = await readClipNotes(clipId);
    const velocities = [...notes.matchAll(/v(\d+)/g)].map((m) => Number(m[1]));

    expect(velocities).toStrictEqual([40, 120, 40, 120]);
  });

  it("seq() selects gain based on clip.index in multi-clip audio update", async () => {
    // Create audio track with 2 clips
    const trackResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "audio", name: "Seq Audio Test" },
    });
    const track = parseToolResult<CreateTrackResult>(trackResult);

    await sleep(100);

    const clip0Result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: track.trackIndex,
        sceneIndex: "0",
        sampleFile: SAMPLE_FILE,
      },
    });
    const clip0 = parseToolResult<{ id: string }>(clip0Result);

    await sleep(100);

    const clip1Result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: track.trackIndex,
        sceneIndex: "1",
        sampleFile: SAMPLE_FILE,
      },
    });
    const clip1 = parseToolResult<{ id: string }>(clip1Result);

    await sleep(100);

    // Apply seq(-6, -12) to both clips: clip 0 → -6, clip 1 → -12
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: `${clip0.id},${clip1.id}`,
        transforms: "gain = seq(-6, -12)",
      },
    });

    await sleep(100);

    const read0 = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip0.id, include: ["sample"] },
    });
    const readClip0 = parseToolResult<ReadClipResult>(read0);

    const read1 = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip1.id, include: ["sample"] },
    });
    const readClip1 = parseToolResult<ReadClipResult>(read1);

    expect(readClip0.gainDb).toBeCloseTo(-6, 0);
    expect(readClip1.gainDb).toBeCloseTo(-12, 0);
  });
});
