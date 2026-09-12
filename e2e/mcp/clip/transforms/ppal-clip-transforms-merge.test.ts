// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the `merge` note-count transform, verified through the Live
 * round-trip. `merge()` collapses same-pitch notes into sustained ones; the
 * optional gap argument decides how far apart two notes may sit and still glue.
 *
 * The unit tests cover the in-memory pipeline; these prove the merged notes
 * survive being written to Live and read back.
 *
 * Uses: e2e-test-set - t8 is the empty MIDI track.
 * Run with: npm run e2e:mcp -- clip/transforms/ppal-clip-transforms-merge
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  parseToolResultWithWarnings,
  type UpdateClipResult,
} from "../../mcp-test-helpers.ts";
import { setupClipTransformTest } from "../helpers/ppal-clip-transforms-test-helpers.ts";

const { createMidiClip, readClipNotes, applyTransform } =
  setupClipTransformTest();

describe("ppal-clip-transforms (merge round-trip)", () => {
  it("spans every same-pitch note into one sustained note", async () => {
    // Three quarter notes with gaps; merge() bridges them all.
    const clipId = await createMidiClip(70, "v100 n/4 C3 1|1 C3 1|3 C3 2|1");

    const result = parseToolResult<UpdateClipResult>(
      await applyTransform(clipId, "merge()"),
    );

    expect(result.noteCount).toBe(1);

    const notes = await readClipNotes(clipId);

    // One note from the first onset to the end of the last: beats 0 through 5.
    expect(notes).toContain("n5/4 C3 1|1");
  });

  it("glues only touching notes with merge(0)", async () => {
    // Beats 0-1 and 1-2 touch; the note at beat 3 is a beat clear of them.
    const clipId = await createMidiClip(71, "v100 n/4 C3 1|1 C3 1|2 C3 1|4");

    const result = parseToolResult<UpdateClipResult>(
      await applyTransform(clipId, "merge(0)"),
    );

    expect(result.noteCount).toBe(2);
  });

  it("glues notes within the gap a note value names", async () => {
    // Eighth notes at beats 0, 1 and 3: gaps of an 8th, then a dotted quarter.
    const clipId = await createMidiClip(72, "v100 n/8 C3 1|1 C3 1|2 C3 1|4");

    const result = parseToolResult<UpdateClipResult>(
      await applyTransform(clipId, "merge(n/8)"),
    );

    expect(result.noteCount).toBe(2);
  });

  it("leaves different pitches independent", async () => {
    const clipId = await createMidiClip(73, "v100 n/4 C3 1|1 D3 1|2 C3 1|3");

    const result = parseToolResult<UpdateClipResult>(
      await applyTransform(clipId, "merge()"),
    );

    // The two C3s merge; the D3 stands alone.
    expect(result.noteCount).toBe(2);
  });

  it("scopes to the notes a selector matched", async () => {
    const clipId = await createMidiClip(74, "v100 n/4 C3 1|1 C3 1|3 D3 1|1");

    const result = parseToolResult<UpdateClipResult>(
      await applyTransform(clipId, "C3: merge()"),
    );

    expect(result.noteCount).toBe(2);
  });

  it("warns and skips on a gap that isn't a note value", async () => {
    const clipId = await createMidiClip(75, "v100 n/4 C3 1|1 C3 1|3");
    const raw = await applyTransform(clipId, "merge(2)");
    const { data, warnings } =
      parseToolResultWithWarnings<UpdateClipResult>(raw);

    expect(warnings.join("\n")).toContain("merge() gap tolerance");
    expect(data.noteCount).toBe(2);
  });
});
