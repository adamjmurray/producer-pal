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
  setupMcpTestContext,
  type UpdateClipResult,
} from "../../mcp-test-helpers.ts";
import { createClipTransformHelpers } from "../helpers/ppal-clip-transforms-test-helpers.ts";

const ctx = setupMcpTestContext();
const { createMidiClip, readClipNotes, applyTransform } =
  createClipTransformHelpers(ctx);

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
});
