// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the `repeat` note-count transform, verified through the Live
 * round-trip. `repeat(offset, copies)` echoes each matched note forward: it keeps
 * the original and emits `copies` time-shifted copies (default 1), each a further
 * `offset` apart. Unlike duplicateLoop it does NOT resize the clip.
 *
 * These create real notes in Live, store them, and read them back, so they
 * exercise Live's note storage rather than the in-memory pipeline the unit tests
 * cover. Echoes are kept inside the 2-bar clip so the read-back is deterministic.
 *
 * Uses: e2e-test-set - t8 is the empty MIDI track.
 * Run with: npm run e2e:mcp -- ppal-clip-transforms-repeat
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  type UpdateClipResult,
} from "../../mcp-test-helpers.ts";
import { setupClipTransformTest } from "../helpers/ppal-clip-transforms-test-helpers.ts";

const { createMidiClip, readClipNotes, applyTransform } =
  setupClipTransformTest();

describe("ppal-clip-transforms (repeat round-trip)", () => {
  it("echoes every note one bar later with repeat(1bar)", async () => {
    // Two quarter notes in bar 1; echo a bar later puts copies in bar 2.
    const clipId = await createMidiClip(60, "v100 n/4 C3 1|1 E3 1|3");

    const result = parseToolResult<UpdateClipResult>(
      await applyTransform(clipId, "repeat(1bar)"),
    );

    // 2 originals + 2 echoes, all inside the 2-bar clip.
    expect(result.noteCount).toBe(4);

    const notes = await readClipNotes(clipId);

    // Bar 1 originals preserved...
    expect(notes).toContain("1|1");
    expect(notes).toContain("1|3");
    // ...and the bar-2 echoes are stored.
    expect(notes).toContain("2|1");
    expect(notes).toContain("2|3");
    expect(notes).toContain("C3");
    expect(notes).toContain("E3");
  });

  it("only echoes notes matching the selector", async () => {
    // C3 and D3 both on the downbeat; echo only C3 a quarter (n/4) later.
    const clipId = await createMidiClip(61, "v100 n/4 C3 1|1 D3 1|1");

    const result = parseToolResult<UpdateClipResult>(
      await applyTransform(clipId, "C3: repeat(n/4)"),
    );

    // C3 -> 2 notes, D3 untouched -> 1 note.
    expect(result.noteCount).toBe(3);

    const notes = await readClipNotes(clipId);

    // The C3 echo lands on beat 2 of bar 1; D3 stays a single downbeat note.
    expect(notes).toContain("1|2");
    expect(notes).toContain("C3");
    expect(notes).toContain("D3");
  });

  it("stamps multiple echoes with the copies argument", async () => {
    // One note at the downbeat; repeat(n/8, 3) adds THREE echoes an eighth
    // (n/8 = 0.5 beat) apart, landing on 1|1.5, 1|2, 1|2.5 — all inside bar 1.
    const clipId = await createMidiClip(62, "v100 C3 1|1");

    const result = parseToolResult<UpdateClipResult>(
      await applyTransform(clipId, "repeat(n/8, 3)"),
    );

    // 1 original + 3 copies = 4 notes (this is what the default copies=1 cases
    // above do NOT exercise).
    expect(result.noteCount).toBe(4);

    const notes = await readClipNotes(clipId);

    // State-based notation compresses the same-pitch run into a comma list of
    // beats, and the overlapping earlier copies get tail-truncated by Live, so
    // assert on the beat positions rather than standalone "1|X" tokens. The 2.5
    // beat is only reachable with three copies — copies=1 would stop at 1.5.
    expect(notes).toContain("C3");
    expect(notes).toContain("1.5"); // 1st echo
    expect(notes).toContain("2.5"); // 3rd echo
  });
});
