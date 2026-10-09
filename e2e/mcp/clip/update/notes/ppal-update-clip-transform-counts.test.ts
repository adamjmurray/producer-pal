// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for what a transform reports: `transformed` counts notes it
 * changed, `deletedNotes` counts notes it removed (left out at 0), and a note it left
 * exactly as it was counts as neither. `transformed: 0` says it changed none.
 *
 * Uses: e2e-test-set - t8 is the empty MIDI track.
 * Run with: npm run e2e:mcp -- ppal-update-clip-transform-counts
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  type UpdateClipResult,
} from "../../../mcp-test-helpers.ts";
import { setupClipTransformTest } from "../../helpers/ppal-clip-transforms-test-helpers.ts";

const { createMidiClip, readClipNotes, applyTransform } =
  setupClipTransformTest();

type CountedResult = UpdateClipResult & { deletedNotes?: number };

describe("ppal-clip-transforms (counts)", () => {
  it("reports notes a transform deletes as deletedNotes, not transformed", async () => {
    const clipId = await createMidiClip(93, "v100 C3 1|1 E3 1|2 G3 1|3");

    const result = parseToolResult<CountedResult>(
      await applyTransform(clipId, "C3: velocity = 0\nE3-G3: velocity = 60"),
    );

    expect(result.deletedNotes).toBe(1);
    expect(result.transformed).toBe(2);
    expect(result.noteCount).toBe(2);
    expect(await readClipNotes(clipId)).not.toContain("C3");
  });

  it("reports transformed 0 and deletedNotes when every note is deleted", async () => {
    const clipId = await createMidiClip(95, "v100 C3 1|1 E3 1|2");

    const result = parseToolResult<CountedResult>(
      await applyTransform(clipId, "velocity = 0"),
    );

    expect(result.deletedNotes).toBe(2);
    expect(result.transformed).toBe(0);
    expect(result.noteCount).toBe(0);
  });

  it("reports transformed 0 when a transform leaves every note as it was", async () => {
    const clipId = await createMidiClip(97, "v100 C3 1|1 E3 1|2");

    const result = parseToolResult<CountedResult>(
      await applyTransform(clipId, "velocity += 0"),
    );

    expect(result.transformed).toBe(0);
    expect(result.deletedNotes).toBeUndefined();
    expect(result.noteCount).toBe(2);
  });

  it("reports notes a merge absorbed as deleted", async () => {
    const clipId = await createMidiClip(98, "v100 C3 1|1 C3 1|2 C3 1|3");

    const result = parseToolResult<CountedResult>(
      await applyTransform(clipId, "merge()"),
    );

    expect(result.transformed).toBe(1);
    expect(result.deletedNotes).toBe(2);
    expect(result.noteCount).toBe(1);
  });

  it("doesn't count a value Live stores at 32-bit precision as changed", async () => {
    // Live reads 0.8 back as 0.800000011920929; writing 0.8 again is no change
    const clipId = await createMidiClip(99, "p0.8 C3 1|1");

    const result = parseToolResult<CountedResult>(
      await applyTransform(clipId, "probability = 0.8"),
    );

    expect(result.transformed).toBe(0);
  });
});
