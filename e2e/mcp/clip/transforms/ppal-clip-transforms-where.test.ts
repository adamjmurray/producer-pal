// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for where() predicate filtering and the `delete` shorthand
 * (alias for `v0`), neither of which had real-Ableton round-trip coverage:
 *  - where(note.* <cmp> N) selects notes by value during selection, AND-combined
 *    with a pitch/time selector.
 *  - `delete` desugars to `velocity = 0` (swept out by the deletion pass) and
 *    composes with selectors and where().
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-clip-transforms-where
 */
import { describe, expect, it } from "vitest";
import { setupMcpTestContext } from "../../mcp-test-helpers.ts";
import { createClipTransformHelpers } from "../helpers/ppal-clip-transforms-test-helpers.ts";

const ctx = setupMcpTestContext();
const { createMidiClip, readClipNotes, applyTransform } =
  createClipTransformHelpers(ctx);

// Distinct pitches so a deleted note can be checked by pitch-token absence with
// no substring collisions (C3/E3/G3/B3 share no prefixes).
const MIXED = "v30 C3 1|1 v110 E3 1|2 v40 G3 1|3 v100 B3 1|4";

describe("ppal-update-clip where() predicate", () => {
  it("deletes notes below a velocity threshold via where() + delete", async () => {
    const clipId = await createMidiClip(0, MIXED);

    await applyTransform(clipId, "where(note.velocity < 50): delete");

    const notes = await readClipNotes(clipId);

    // Quiet notes (C3 v30, G3 v40) removed; loud notes (E3, B3) remain.
    expect(notes).toContain("E3");
    expect(notes).toContain("B3");
    expect(notes).not.toContain("C3");
    expect(notes).not.toContain("G3");
  });

  it("raises velocity of loud notes via a predicate (no delete)", async () => {
    const clipId = await createMidiClip(1, MIXED);

    await applyTransform(clipId, "where(note.velocity > 90): velocity += 20");

    const notes = await readClipNotes(clipId);

    // E3 110→127 (clamped), B3 100→120; quiet notes untouched. Assert velocity
    // and pitch tokens separately — the notation is state-based, so velocity is
    // only emitted on change and exact spacing isn't guaranteed.
    expect(notes).toContain("v127");
    expect(notes).toContain("v120");
    expect(notes).toContain("v30");
    expect(notes).toContain("E3");
    expect(notes).toContain("B3");
  });

  it("AND-combines a pitch selector with a predicate", async () => {
    const clipId = await createMidiClip(2, MIXED);

    // Only notes in C3-F3 AND below v50: C3 (v30) qualifies; G3 (v40) is out of
    // the pitch band, so it survives.
    await applyTransform(clipId, "C3-F3 where(note.velocity < 50): delete");

    const notes = await readClipNotes(clipId);

    expect(notes).not.toContain("C3");
    expect(notes).toContain("G3");
    expect(notes).toContain("E3");
    expect(notes).toContain("B3");
  });
});

describe("ppal-update-clip delete shorthand (alias for v0)", () => {
  it("clears a single lane with a pitch selector", async () => {
    const clipId = await createMidiClip(3, "v100 C3 E3 G3 1|1");

    await applyTransform(clipId, "E3: delete");

    const notes = await readClipNotes(clipId);

    expect(notes).not.toContain("E3");
    expect(notes).toContain("C3");
    expect(notes).toContain("G3");
  });

  it("clears the whole clip when used bare", async () => {
    const clipId = await createMidiClip(4, "v100 C3 D3 E3 1|1");

    await applyTransform(clipId, "delete");

    const notes = await readClipNotes(clipId);

    expect(notes).not.toContain("C3");
    expect(notes).not.toContain("D3");
    expect(notes).not.toContain("E3");
  });
});
