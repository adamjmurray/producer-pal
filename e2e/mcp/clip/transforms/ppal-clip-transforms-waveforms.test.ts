// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for waveform phase behavior in transforms.
 * Verifies that each waveform produces correct values at key phase points.
 * Uses: e2e-test-set - t8 is empty MIDI track
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-clip-transforms-waveforms
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResultWithWarnings,
  setupMcpTestContext,
  type UpdateClipResult,
} from "../../mcp-test-helpers.ts";
import { createClipTransformHelpers } from "../helpers/ppal-clip-transforms-test-helpers.ts";

const ctx = setupMcpTestContext();
const { createMidiClip, applyTransform, readClipNotes } =
  createClipTransformHelpers(ctx);

/** Creates a MIDI clip with 4 notes at beats 1|1-1|4 for waveform testing. */
async function createWaveformClip(sceneIndex: number): Promise<string> {
  return createMidiClip(
    sceneIndex,
    "v64 C3 1|1\nv64 C3 1|2\nv64 C3 1|3\nv64 C3 1|4",
  );
}

/** Applies a transform and returns the notes string. */
async function applyAndReadNotes(
  clipId: string,
  transform: string,
): Promise<string> {
  await applyTransform(clipId, transform);

  return readClipNotes(clipId);
}

/** Extracts velocity values from notes string (only finds explicit v markers). */
function extractVelocities(notes: string): number[] {
  return [...notes.matchAll(/v(\d+)/g)].map((m) => Number(m[1]));
}

// All waveforms use: velocity = 64 + 50 * waveform(n/1)
// n/1 = whole note = 4 beats = one cycle per bar in 4/4
// 4 notes at phases 0, 0.25, 0.5, 0.75

describe("ppal-clip-transforms-waveforms", () => {
  it("cos() starts at peak (1.0)", async () => {
    const clipId = await createWaveformClip(36);

    // cos: phase 0→1, 0.25→0, 0.5→-1, 0.75→0
    // velocity: 114, 64, 14, 64
    const notes = await applyAndReadNotes(
      clipId,
      "velocity = 64 + 50 * cos(n/1)",
    );

    // Beats 2 and 4 share v64, comma-merged (first note carries explicit n/4)
    expect(notes).toContain("v114 n/4 C3 1|1");
    expect(notes).toContain("v64 C3 1|2,4");
    expect(notes).toContain("v14 C3 1|3");
  });

  // sin and tri have identical phase behavior: 0→0, 0.25→1, 0.5→0, 0.75→-1
  // velocity: 64, 114, 64, 14
  it.each([
    { waveform: "sin", scene: 37 },
    { waveform: "tri", scene: 38 },
  ])(
    "$waveform() starts at zero, rises to peak",
    async ({ waveform, scene }) => {
      const clipId = await createWaveformClip(scene);

      const notes = await applyAndReadNotes(
        clipId,
        `velocity = 64 + 50 * ${waveform}(n/1)`,
      );

      // Beats 1 and 3 share v64, comma-merged (first note carries explicit n/4)
      expect(notes).toContain("v64 n/4 C3 1|1,3");
      expect(notes).toContain("v114 C3 1|2");
      expect(notes).toContain("v14 C3 1|4");
    },
  );

  it("saw() starts at zero, rises to peak then jumps", async () => {
    const clipId = await createWaveformClip(39);

    // saw: phase 0→0, 0.25→0.5, 0.5→-1, 0.75→-0.5
    // velocity: 64, 89, 14, 39
    const velocities = extractVelocities(
      await applyAndReadNotes(clipId, "velocity = 64 + 50 * saw(n/1)"),
    );

    expect(velocities).toHaveLength(4);
    expect(velocities[0]).toBe(64);
    expect(velocities[1]).toBe(89);
    expect(velocities[2]).toBe(14);
    expect(velocities[3]).toBe(39);
  });

  it("square() starts at peak (1.0)", async () => {
    const clipId = await createWaveformClip(40);

    // square: phase 0→1, 0.25→1, 0.5→-1, 0.75→-1
    // velocity: 114, 114, 14, 14
    // Note: notation format uses state changes, so consecutive identical
    // velocities aren't repeated. Check pattern instead of counting v markers.
    const notes = await applyAndReadNotes(
      clipId,
      "velocity = 64 + 50 * square(n/1)",
    );

    // First two notes at v114 (high), last two at v14 (low)
    expect(notes).toMatch(/^v114\b/);
    expect(notes).toMatch(/v14\b.*1\|3/);
    expect(notes).not.toMatch(/v64/); // No notes at mid-velocity
  });

  // A period that divides the note spacing samples ONE phase, so every note
  // would get the same value. The assignment is warned about and skipped —
  // the clip is created with four DIFFERENT velocities precisely so a skip is
  // distinguishable from a flattening write.
  it("warns and writes nothing when the period lands every note on one phase", async () => {
    const clipId = await createMidiClip(
      41,
      "v40 C3 1|1\nv70 C3 1|2\nv100 C3 1|3\nv120 C3 1|4",
    );
    const { warnings } = parseToolResultWithWarnings<UpdateClipResult>(
      await applyTransform(clipId, "velocity = 64 + 50 * sin(1)"),
    );

    expect(warnings.join("\n")).toContain("flat LFO");
    expect(warnings.join("\n")).toContain("nothing was written");
    expect(extractVelocities(await readClipNotes(clipId))).toStrictEqual([
      40, 70, 100, 120,
    ]);
  });

  // Skipping is per assignment, not per call: the flat line is dropped and
  // every other line in the same transform still lands.
  it("skips only the flat assignment, not the whole transform", async () => {
    const clipId = await createMidiClip(
      44,
      "v40 C3 1|1\nv70 C3 1|2\nv100 C3 1|3\nv120 C3 1|4",
    );
    const { warnings } = parseToolResultWithWarnings<UpdateClipResult>(
      await applyTransform(
        clipId,
        "velocity = 64 + 50 * sin(1)\nprobability = 0.5",
      ),
    );

    expect(warnings.join("\n")).toContain("flat LFO");

    const notes = await readClipNotes(clipId);

    expect(extractVelocities(notes)).toStrictEqual([40, 70, 100, 120]);
    expect(notes).toContain("p0.5");
  });

  // ramp()/curve() interpolate across the RANGE, not across the notes they
  // matched, so a range ending more than one grid step past the last note stops
  // short of its end value with nothing else in the response to say so. Seven
  // 16th hats stop at 2|4.5, two steps inside a `2|3-3|1` range.
  it("warns when a ramp's range ends past its last note", async () => {
    const clipId = await createMidiClip(46, "v100 n/16 C3 2|3x7");
    const { warnings } = parseToolResultWithWarnings<UpdateClipResult>(
      await applyTransform(clipId, "2|3-3|1: velocity = ramp(1, 127)"),
    );

    expect(warnings.join("\n")).toContain("of the way to its end value");
    // The warning names the position to end the range on, which is the fix.
    expect(warnings.join("\n")).toContain("2|4.5");
    // Every hat was transformed, and none of them reached the asked-for 127.
    expect(await readClipNotes(clipId)).not.toContain("v127");
  });

  it("stays quiet when the range ends on the ramp's last note", async () => {
    const clipId = await createMidiClip(47, "v100 n/16 C3 2|3x8");
    const { warnings } = parseToolResultWithWarnings<UpdateClipResult>(
      await applyTransform(clipId, "2|3-2|4.75: velocity = ramp(1, 127)"),
    );

    expect(warnings.join("\n")).not.toContain("of the way to its end value");
    expect(await readClipNotes(clipId)).toContain("v127");
  });

  it("stays quiet when the range ends one grid step past the last note", async () => {
    // Eight 16ths fill beats 3-4, so `3|1` is one step past the last of them —
    // the ordinary cost of a round bound, not a mistake to report.
    const clipId = await createMidiClip(48, "v100 n/16 C3 2|3x8");
    const { warnings } = parseToolResultWithWarnings<UpdateClipResult>(
      await applyTransform(clipId, "2|3-3|1: velocity = ramp(1, 127)"),
    );

    expect(warnings.join("\n")).not.toContain("of the way to its end value");
  });

  it("stays quiet when the waveform actually varies the notes", async () => {
    const clipId = await createWaveformClip(42);
    const { warnings } = parseToolResultWithWarnings<UpdateClipResult>(
      await applyTransform(clipId, "velocity = 64 + 50 * sin(n/1)"),
    );

    expect(warnings.join("\n")).not.toContain("flat LFO");
  });
});
