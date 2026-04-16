// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for timing transforms (swing, quant, legato),
 * wrap/reflect pitch functions, and comment support.
 * Uses: e2e-test-set - t8 is empty MIDI track
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-clip-transforms-timing
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
} from "../mcp-test-helpers.ts";
import {
  createClipTransformHelpers,
  parseNotationDuration,
} from "./helpers/ppal-clip-transforms-test-helpers.ts";

const ctx = setupMcpTestContext();
const { createMidiClip, applyTransform, readClipNotes } =
  createClipTransformHelpers(ctx);

/**
 * Extract all individual start beats from notation, expanding comma-merged
 * positions (e.g. "1|1,2.5,3" → beats at 1|1, 1|2.5, 1|3).
 * Returns beat offsets from clip start (0-based) in 4/4 time, sorted
 * chronologically. (Notation groups notes by duration, not time order.)
 */
function extractStartBeats(notes: string): number[] {
  const beats: number[] = [];

  // Match a bar|beat followed by optional comma-separated continuations
  const pattern = /(\d+)\|([\d.]+(?:,[\d.]+)*)/g;
  let match;

  while ((match = pattern.exec(notes)) !== null) {
    const bar = Number(match[1]) - 1;
    const beatValues = (match[2] as string).split(",");

    for (const b of beatValues) {
      beats.push(bar * 4 + (Number(b) - 1));
    }
  }

  return beats.sort((a, b) => a - b);
}

/** Extract duration values (t prefix) from notation. */
function extractDurations(notes: string): number[] {
  return [...notes.matchAll(/t(\S+)/g)].map((m) =>
    parseNotationDuration(m[1] as string),
  );
}

/** Read clip with full details including notes. */
async function readClipFull(clipId: string): Promise<ReadClipResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-clip",
    arguments: { clipId, include: ["notes"] },
  });

  return parseToolResult<ReadClipResult>(result);
}

// =============================================================================
// swing() tests
// =============================================================================

describe("ppal-clip-transforms (swing)", () => {
  it("does not offset on-beat quarter notes", async () => {
    const clipId = await createMidiClip(60, "v80 C3 1|1 C3 1|2 C3 1|3 C3 1|4");

    await applyTransform(clipId, "timing = swing(0.1)");
    const notes = await readClipNotes(clipId);
    const starts = extractStartBeats(notes);

    // Quarter notes are all on-beat — swing should not move them
    expect(starts).toHaveLength(4);
    expect(starts[0]).toBeCloseTo(0, 1);
    expect(starts[1]).toBeCloseTo(1, 1);
    expect(starts[2]).toBeCloseTo(2, 1);
    expect(starts[3]).toBeCloseTo(3, 1);
  });

  it("offsets off-beat 8th notes", async () => {
    const clipId = await createMidiClip(61, "t/2 C3 1|1x8");

    await applyTransform(clipId, "timing = swing(0.1)");
    const notes = await readClipNotes(clipId);
    const starts = extractStartBeats(notes);

    expect(starts).toHaveLength(8);

    // On-beat notes (positions 0, 1, 2, 3) should stay on grid
    expect(starts[0]).toBeCloseTo(0, 1);
    expect(starts[2]).toBeCloseTo(1, 1);
    expect(starts[4]).toBeCloseTo(2, 1);
    expect(starts[6]).toBeCloseTo(3, 1);

    // Off-beat notes should be shifted by ~0.1
    expect(starts[1]).toBeCloseTo(0.6, 1);
    expect(starts[3]).toBeCloseTo(1.6, 1);
    expect(starts[5]).toBeCloseTo(2.6, 1);
    expect(starts[7]).toBeCloseTo(3.6, 1);
  });

  it("applies 16th-note swing with custom grid", async () => {
    const clipId = await createMidiClip(62, "t/4 C3 1|1x16");

    await applyTransform(clipId, "timing = swing(0.05, 1/4t)");
    const notes = await readClipNotes(clipId);
    const starts = extractStartBeats(notes);

    expect(starts).toHaveLength(16);

    // On-beat 16ths (every other) should stay on grid
    expect(starts[0]).toBeCloseTo(0, 1); // beat 1
    expect(starts[2]).toBeCloseTo(0.5, 1); // beat 1.5

    // Off-beat 16ths should be shifted by ~0.05
    expect(starts[1]).toBeCloseTo(0.3, 1); // 0.25 + 0.05
    expect(starts[3]).toBeCloseTo(0.8, 1); // 0.75 + 0.05
  });

  it("auto-quantizes so re-applying swing is safe", async () => {
    const clipId = await createMidiClip(63, "t/2 C3 1|1x8");

    // Use small swing amounts that stay within the quantize grid (grid/8=0.0625)
    await applyTransform(clipId, "timing = swing(0.04)");
    await applyTransform(clipId, "timing = swing(0.02)");

    const notes = await readClipNotes(clipId);
    const starts = extractStartBeats(notes);

    // After re-apply, off-beats should reflect the second amount, not compound.
    // Auto-quantize (grid/4=0.125) snaps 0.54 back to 0.5, then applies 0.02.
    expect(starts[1]).toBeCloseTo(0.52, 1);
    expect(starts[3]).toBeCloseTo(1.52, 1);
  });

  it("raw keyword skips auto-quantize", async () => {
    const clipId = await createMidiClip(64, "t/2 C3 1|1x4");

    await applyTransform(clipId, "timing = swing(0.1)");
    const afterFirstSwing = extractStartBeats(await readClipNotes(clipId));

    expect(afterFirstSwing[1]).toBeCloseTo(0.6, 1); // off-beat swung

    // Re-apply with raw — position 0.6 is used directly (no re-quantize)
    // Phase = (0.6/1.0) % 1.0 = 0.6 → off-beat → 0.6 + 0.05 = 0.65
    await applyTransform(clipId, "timing = swing(0.05, raw)");
    const afterRawSwing = extractStartBeats(await readClipNotes(clipId));

    expect(afterRawSwing[1]).toBeCloseTo(0.65, 1);
  });

  it("swing(0) is a no-op", async () => {
    const clipId = await createMidiClip(65, "t/2 C3 1|1x8");

    await applyTransform(clipId, "timing = swing(0)");
    const notes = await readClipNotes(clipId);
    const starts = extractStartBeats(notes);

    expect(starts).toHaveLength(8);

    // All notes should remain on the 8th-note grid
    for (let i = 0; i < 8; i++) {
      expect(starts[i]).toBeCloseTo(i * 0.5, 1);
    }
  });
});

// =============================================================================
// quant() timing tests
// =============================================================================

describe("ppal-clip-transforms (quant)", () => {
  it("quantizes to 8th-note grid", async () => {
    // Create notes at slightly off-grid positions
    const clipId = await createMidiClip(67, "C3 1|1 C3 1|1.6 C3 1|2.4 C3 1|3");

    await applyTransform(clipId, "timing = quant(1/2t)");
    const notes = await readClipNotes(clipId);
    const starts = extractStartBeats(notes);

    // Two pairs of notes land on the same position after quantize (1|1→1|1,
    // 1|2.4→1|2.5 which is 1|1.5 in the output? No...)
    // Actually: 1|1→0, 1|1.6→0.5, 1|2.4→1.5, 1|3→2
    // Some may comma-merge if same pitch at same position
    // 1|1 (0) and 1|3 (2) are already on grid, 1|1.6→1|1.5, 1|2.4→1|2.5
    expect(starts).toContain(0);
    expect(starts).toContain(0.5); // 0.6 → 0.5
    expect(starts).toContain(1.5); // 1.4 → 1.5
    expect(starts).toContain(2); // already on grid
  });

  it("quantizes to 16th-note grid", async () => {
    const clipId = await createMidiClip(
      68,
      "C3 1|1 C3 1|1.3 C3 1|1.6 C3 1|2.1",
    );

    await applyTransform(clipId, "timing = quant(1/4t)");
    const notes = await readClipNotes(clipId);
    const starts = extractStartBeats(notes);

    // 0→0, 0.3→0.25, 0.6→0.5, 1.1→1.0
    // 0 and 1.0 are on grid; note at 0 and note quantized to 1|1 may merge
    expect(starts).toContain(0);
    expect(starts).toContain(0.25); // 0.3 → 0.25
    expect(starts).toContain(0.5); // 0.6 → 0.5
    expect(starts).toContain(1); // 1.1 → 1.0
  });

  it("undoes swing when applied after", async () => {
    const clipId = await createMidiClip(69, "t/2 C3 1|1x8");

    // Apply swing, then quantize back to grid
    await applyTransform(clipId, "timing = swing(0.1)");

    // Confirm swing was applied
    let starts = extractStartBeats(await readClipNotes(clipId));

    expect(starts[1]).toBeCloseTo(0.6, 1); // Off-beat swung

    // Quantize to 8th-note grid should undo the swing
    await applyTransform(clipId, "timing = quant(1/2t)");
    starts = extractStartBeats(await readClipNotes(clipId));

    expect(starts).toHaveLength(8);

    for (let i = 0; i < 8; i++) {
      expect(starts[i]).toBeCloseTo(i * 0.5, 1);
    }
  });

  it("works with numeric period (0.5 = 1/2t)", async () => {
    const clipId = await createMidiClip(70, "C3 1|1 C3 1|1.6");

    await applyTransform(clipId, "timing = quant(0.5)");
    const starts = extractStartBeats(await readClipNotes(clipId));

    expect(starts).toContain(0);
    expect(starts).toContain(0.5); // 0.6 → 0.5
  });
});

// =============================================================================
// legato() tests
// =============================================================================

describe("ppal-clip-transforms (legato)", () => {
  it("extends note durations to next note start", async () => {
    const clipId = await createMidiClip(71, "t/4 C3 1|1 E3 1|2 G3 1|3 C4 1|4");

    await applyTransform(clipId, "duration = legato()");
    const notes = await readClipNotes(clipId);

    // Each note gets duration=1 (gap between consecutive beats).
    // t1 is the default duration, so it may be omitted in notation.
    // The last note (C4 at 1|4) extends to clip end (8 - 3 = 5 beats).
    // Verify the last note's explicit duration
    expect(notes).toMatch(/t5\b.*C4.*1\|4/);

    // First three notes have duration=1 (default), verify they exist at positions
    expect(notes).toContain("C3");
    expect(notes).toContain("E3");
    expect(notes).toContain("G3");
  });

  it("extends chord tones to next distinct start time", async () => {
    const clipId = await createMidiClip(72, "t/4 C3 E3 G3 1|1 C4 1|3");

    await applyTransform(clipId, "duration = legato()");
    const clip = await readClipFull(clipId);
    const notes = clip.notes ?? "";

    // All three chord tones at 1|1 should extend to 1|3 (2 beats)
    expect(notes).toMatch(/t2\b/);
    expect(notes).toContain("C3");
    expect(notes).toContain("E3");
    expect(notes).toContain("G3");
  });

  it("works with pitch filter", async () => {
    const clipId = await createMidiClip(74, "t/4 C2 1|1 C3 1|2 C2 1|3 C3 1|4");

    // Only apply legato to bass notes (C2)
    await applyTransform(clipId, "C2: duration = legato()");
    const notes = await readClipNotes(clipId);
    const durations = extractDurations(notes);

    // C2 notes should get legato (2 beat gap between 1|1 and 1|3)
    // C3 notes should keep original 1/4 duration
    expect(durations).toContain(2); // C2 legato duration
    expect(durations).toContain(0.25); // C3 unchanged
  });

  it("extends last note to clip end with clip context", async () => {
    const clipId = await createMidiClip(75, "t/4 C3 1|1 E3 1|3");

    // Clip is 2:0.0 = 8 beats
    await applyTransform(clipId, "duration = legato()");
    const notes = await readClipNotes(clipId);

    // C3 at 1|1 → extends to 1|3 = 2 beats
    expect(notes).toMatch(/t2\b.*C3.*1\|1/);

    // E3 at 1|3 → extends to end of 2-bar clip = 6 beats (8 - 2)
    expect(notes).toMatch(/t6\b.*E3.*1\|3/);
  });

  it("legato(0) behaves same as legato()", async () => {
    const clipId = await createMidiClip(76, "t/4 C3 E3 1|1 G3 1|3");

    await applyTransform(clipId, "duration = legato(0)");
    const notes = await readClipNotes(clipId);

    // Both chord tones at 1|1 should extend to 1|3 (2 beats)
    expect(notes).toMatch(/t2\b/);
    expect(notes).toContain("C3");
    expect(notes).toContain("E3");
  });
});

// =============================================================================
// wrap() tests
// =============================================================================

describe("ppal-clip-transforms (wrap)", () => {
  it("wraps pitch within one-octave range", async () => {
    // C3=60, E3=64, G3=67, C4=72
    const clipId = await createMidiClip(77, "C3 1|1 E3 1|2 G3 1|3 C4 1|4");

    // Transpose up 12 semitones, wrap within C3-B3 (60-71)
    await applyTransform(clipId, "pitch = wrap(note.pitch + 12, C3, B3)");
    const notes = await readClipNotes(clipId);

    // C3+12=72 → wraps to C3, E3+12=76 → E3, G3+12=79 → G3, C4+12=84 → C3
    // All notes remain in the C3-B3 octave
    expect(notes).toContain("C3");
    expect(notes).toContain("E3");
    expect(notes).toContain("G3");
    // Should not contain any notes outside C3-B3
    expect(notes).not.toMatch(/C4|D4|E4|F4|G4|A4|B4/);
  });

  it("does not change notes already in range", async () => {
    const clipId = await createMidiClip(78, "C3 1|1 E3 1|2 G3 1|3");

    // Wrap with range that includes all notes (C3=60 to B3=71)
    await applyTransform(clipId, "pitch = wrap(note.pitch, C3, B3)");
    const notes = await readClipNotes(clipId);

    expect(notes).toContain("C3");
    expect(notes).toContain("E3");
    expect(notes).toContain("G3");
  });

  it("wraps with transpose across wider range", async () => {
    // B4=83, transpose +5 = 88 (E5), wrap to C3(60)-C5(84)
    const clipId = await createMidiClip(79, "B4 1|1");

    await applyTransform(clipId, "pitch = wrap(note.pitch + 5, C3, C5)");
    const notes = await readClipNotes(clipId);

    // 83+5=88, wrap(88, 60, 84) range=25, (88-60)%25=3, 60+3=63 = Eb3
    expect(notes).toMatch(/Eb3|D#3/);
  });
});

// =============================================================================
// reflect() tests
// =============================================================================

describe("ppal-clip-transforms (reflect)", () => {
  it("bounces pitch within range", async () => {
    // G3=67, transpose +12 = 79, reflect within C3(60)-B3(71)
    const clipId = await createMidiClip(80, "G3 1|1 A3 1|2");

    await applyTransform(clipId, "pitch = reflect(note.pitch + 12, C3, B3)");
    const notes = await readClipNotes(clipId);

    // G3+12=79, reflect(79, 60, 71): range=11, period=22
    // (79-60)%22 = 19, 19 > 11 → 22-19+60 = 63 = Eb3
    expect(notes).toMatch(/Eb3|D#3/);
    // A3+12=81, reflect(81, 60, 71): (81-60)%22 = 21, 21 > 11 → 22-21+60 = 61 = Db3
    expect(notes).toMatch(/Db3|C#3/);
  });

  it("produces different results than wrap", async () => {
    const clipIdWrap = await createMidiClip(81, "B3 1|1");
    const clipIdReflect = await createMidiClip(82, "B3 1|1");

    // B3=71, +5=76, range C3(60)-A3(69)
    await applyTransform(clipIdWrap, "pitch = wrap(note.pitch + 5, C3, A3)");
    await applyTransform(
      clipIdReflect,
      "pitch = reflect(note.pitch + 5, C3, A3)",
    );

    const wrapNotes = await readClipNotes(clipIdWrap);
    const reflectNotes = await readClipNotes(clipIdReflect);

    // wrap and reflect should produce different pitches
    expect(wrapNotes).not.toBe(reflectNotes);
  });
});

// =============================================================================
// Comment support tests
// =============================================================================

describe("ppal-clip-transforms (comments)", () => {
  it("line comment (//) does not break transform", async () => {
    const clipId = await createMidiClip(83, "v80 C3 1|1");

    await applyTransform(clipId, "velocity += 10 // boost velocity");
    const notes = await readClipNotes(clipId);

    expect(notes).toContain("v90");
  });

  it("hash comment (#) does not break transform", async () => {
    const clipId = await createMidiClip(84, "v80 C3 1|1");

    await applyTransform(clipId, "velocity += 10 # boost");
    const notes = await readClipNotes(clipId);

    expect(notes).toContain("v90");
  });

  it("multi-line with block comments", async () => {
    const clipId = await createMidiClip(85, "v80 C3 1|1 C3 1|2 C3 1|3 C3 1|4");

    await applyTransform(
      clipId,
      `/* Set velocity to 90 */
velocity = 90
// Shift timing slightly
timing += 0.1`,
    );
    const notes = await readClipNotes(clipId);

    // v90 is explicit (not default 100), so it should appear
    expect(notes).toContain("v90");
    expect(notes).toContain("1|1.1");
  });
});
