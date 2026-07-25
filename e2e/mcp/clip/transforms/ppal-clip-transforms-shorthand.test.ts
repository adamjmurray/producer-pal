// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for v1.4.11 transform-string additions:
 *  - `v±N` / `p±N` additive shorthand operators (commit 1085758e).
 *  - `clipseq()` clip-axis cycling across a multi-clip batch (incl. wrap-around),
 *    distinct from note-axis `seq()`. The existing audio-gain clipseq case lives
 *    in ppal-clip-transforms.test.ts; here we cover MIDI pitch + wrap-around.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-clip-transforms-shorthand
 */
import { describe, expect, it } from "vitest";
import { setupClipTransformTest } from "../helpers/ppal-clip-transforms-test-helpers.ts";

const { createMidiClip, readClipNotes, applyTransform, applyTransformToClips } =
  setupClipTransformTest();

describe("ppal-update-clip v±N / p±N shorthand", () => {
  it("v+N adds to existing velocity", async () => {
    const clipId = await createMidiClip(0, "v100 C3 D3 E3 1|1");

    await applyTransform(clipId, "v+10");

    expect(await readClipNotes(clipId)).toContain("v110");
  });

  it("v-N subtracts from existing velocity", async () => {
    const clipId = await createMidiClip(0, "v100 C3 1|1,2,3,4");

    await applyTransform(clipId, "v-20");

    expect(await readClipNotes(clipId)).toContain("v80");
  });

  it("p+N adds to existing probability", async () => {
    // 0.5 and 0.25 are exact in binary, so the sum serializes cleanly as p0.75.
    const clipId = await createMidiClip(0, "p0.5 C3 1|1");

    await applyTransform(clipId, "p+0.25");

    expect(await readClipNotes(clipId)).toContain("p0.75");
  });

  it("p-N subtracts from existing probability", async () => {
    const clipId = await createMidiClip(0, "p0.75 C3 1|1");

    await applyTransform(clipId, "p-0.25");

    expect(await readClipNotes(clipId)).toContain("p0.5");
  });
});

describe("ppal-update-clip clipseq() (clip-axis cycling)", () => {
  it("cycles by clip.index across a MIDI batch", async () => {
    // Three clips, all C3 (pitch 60). pitch += clipseq(0, 5, 7) → C3 / F3 / G3.
    await expectClipseqTransposes("pitch += clipseq(0, 5, 7)", [
      "C3", // 60 + 0
      "F3", // 60 + 5
      "G3", // 60 + 7
    ]);
  });

  it("wraps around when there are fewer args than clips", async () => {
    // clipseq(0, 12) across 3 clips → +0 / +12 / +0 (clip 2 wraps to args[0]).
    await expectClipseqTransposes("pitch += clipseq(0, 12)", [
      "C3", // 60 + 0
      "C4", // 60 + 12
      "C3", // wraps → 60 + 0
    ]);
  });
});

/**
 * Create three single-C3 clips, apply one clip-axis transform across the batch,
 * and assert each clip landed on its expected pitch.
 * @param transform - The clipseq transform to apply to all three clips
 * @param expectedPitches - Expected pitch per clip, in clip.index order
 */
async function expectClipseqTransposes(
  transform: string,
  expectedPitches: string[],
): Promise<void> {
  const ids = [
    await createMidiClip(0, "C3 1|1"),
    await createMidiClip(1, "C3 1|1"),
    await createMidiClip(2, "C3 1|1"),
  ];

  await applyTransformToClips(ids, transform);

  for (const [index, id] of ids.entries()) {
    expect(await readClipNotes(id)).toContain(expectedPitches[index]);
  }
}
