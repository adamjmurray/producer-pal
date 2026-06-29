// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for transforms over a RATCHETED note run, verified through the Live
 * round-trip. Both scenarios reproduce a real failure applying a velocity ramp /
 * accent pattern to a ratcheted hi-hat:
 *
 *   1. Float-tolerant selectors — ratchet() generates note start times via
 *      `start + k*(duration/N)`, which can land a few ULPs below a bar|beat
 *      bound that names the same position. A windowed selector must still match
 *      the boundary piece after Live stores and returns it.
 *   2. Selection-local indexing — note.index / seq() must count from the start
 *      of the notes the selector actually picked, not the whole same-pitch run,
 *      so a window over the tail of a ratcheted burst is not offset by the
 *      pieces before it.
 *
 * The ratchet and the windowed assignment run as SEPARATE update-clip calls on
 * purpose: the second call reads the ratcheted notes back from Live, so these
 * exercise Live's stored note positions rather than the in-memory pipeline that
 * the unit tests already cover.
 *
 * Uses: e2e-test-set - t8 is the empty MIDI track.
 * Run with: npm run e2e:mcp -- ppal-clip-transforms-ratchet
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  type UpdateClipResult,
} from "../../mcp-test-helpers.ts";
import { setupClipTransformTest } from "../helpers/ppal-clip-transforms-test-helpers.ts";

const { createMidiClip, readClipNotes, applyTransform } =
  setupClipTransformTest();

describe("ppal-clip-transforms (ratchet round-trip)", () => {
  it("matches the boundary piece of a ratcheted burst with a windowed selector", async () => {
    // One 1-beat hat at 1|1. ratchet(6) splits it into pieces every 1/6 beat:
    // beats 0, 1/6, 2/6, 3/6, 4/6, 5/6. The k=3 piece is `3 * (1/6)` =
    // 0.49999999999999994 in IEEE-754 — a hair under the 0.5 beat that `1|1.5`
    // parses to. Before the selector tolerance fix, the half-open window
    // [1|1.5, 1|2) dropped that piece (0.4999… >= 0.5 is false), accenting only
    // 2 of the 3 pieces in the window.
    const clipId = await createMidiClip(90, "v72 n/4 Gb1 1|1");

    await applyTransform(clipId, "ratchet(6)");

    const windowed = parseToolResult<UpdateClipResult>(
      await applyTransform(clipId, "Gb1 1|1.5-<1|2: velocity = 127"),
    );

    // Pieces k=3,4,5 fall in [0.5, 1) beats — all three accented.
    expect(windowed.transformed).toBe(3);

    const notes = await readClipNotes(clipId);

    expect(notes).toContain("v127"); // windowed pieces accented
    expect(notes).toContain("v72"); // earlier pieces untouched
  });

  it("indexes seq() from the start of a windowed ratchet tail", async () => {
    // Two 1-beat hats at 1|1 and 1|2. ratchet(2) yields 4 pieces:
    // beats 0, 0.5 (first hat) and 1.0, 1.5 (second hat). A window over the
    // second hat (beats >= 1) selects exactly its 2 pieces.
    const clipId = await createMidiClip(91, "v100 n/4 Gb1 1|1 Gb1 1|2");

    await applyTransform(clipId, "ratchet(2)");

    // seq has 3 values but only 2 notes are selected, so a correct 0-based
    // selection index gives 40, 80. The old clip-wide cursor would start at 2
    // (the two earlier pieces), producing 120, 40 instead.
    await applyTransform(clipId, "Gb1 1|2-<2|1: velocity = seq(40, 80, 120)");

    const notes = await readClipNotes(clipId);

    expect(notes).toContain("v40"); // selection index 0
    expect(notes).toContain("v80"); // selection index 1
    expect(notes).not.toContain("v120"); // would appear with clip-wide index
    expect(notes).toContain("v100"); // first hat's pieces untouched
  });
});
