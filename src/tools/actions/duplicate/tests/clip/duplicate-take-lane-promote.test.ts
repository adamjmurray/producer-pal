// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Promoting a take-lane clip to the main lane.
 *
 * Its own suite because the source is the odd one:
 * `duplicate_clip_to_arrangement` silently no-ops on a take-lane id, so a
 * promote rebuilds the clip the way a write onto a lane does — and loses the
 * same things.
 */

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../duplicate-mocks-test-helpers.ts";
import { lookupMockObject } from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";

// Capture take lane warnings
vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerLiveSet,
  registerTakeLaneSource,
  SOURCE_NOTE,
} from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";
import * as consoleMock from "#src/shared/max/v8-max-console.ts";

describe("promoting a take-lane clip", () => {
  // Promotion goes through the same re-create as a lane write, because
  // duplicate_clip_to_arrangement no-ops on a take-lane SOURCE id.
  it("promotes a take-lane clip to the main lane when the destination names no lane", async () => {
    registerLiveSet();

    const track = registerTakeLaneTrack({ initialLanes: 1 });

    registerTakeLaneSource();

    const result = await duplicate({
      type: "clip",
      id: "tl_src_clip",
      arrangementStart: "5|1",
    });

    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 16, 4);
    // Reported on the main lane ("t0"), not a lane path, and as the new clip
    // the re-create made rather than the source it read.
    expect(result).toStrictEqual({
      id: expect.not.stringMatching(/^tl_src_clip$/) as unknown as string,
      path: "t0[5|1]",
    });

    // It's a copy: nothing tries to clear the source off its lane.
    expect(track.call).not.toHaveBeenCalledWith(
      "delete_clip",
      expect.anything(),
    );
  });

  it("copies the source's notes onto the promoted clip", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 1 });
    registerTakeLaneSource();

    await duplicate({
      type: "clip",
      id: "tl_src_clip",
      arrangementStart: "5|1",
    });

    const promoted = lookupMockObject(
      undefined,
      livePath.track(0).arrangementClip(0),
    );

    expect(promoted?.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [SOURCE_NOTE],
    });
  });

  // A promote emitted no warning at all before, so the envelope loss was silent.
  // Like the other re-create warnings, it's per call rather than per copy.
  it("warns once that a promoted copy loses automation envelopes", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 1 });
    registerTakeLaneSource({ has_envelopes: 1 });

    await duplicate({
      type: "clip",
      id: "tl_src_clip",
      arrangementStart: "1|1,2|1,3|1",
    });

    const warnings = vi
      .mocked(consoleMock.warn)
      .mock.calls.filter(([message]) =>
        String(message).includes("automation envelopes aren't copied"),
      );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.[0]).toContain("promoted to the main lane");
  });

  // Promoting re-creates the clip, which an audio clip with no sample file has
  // nothing to do from. The reason doesn't change per copy, so neither should
  // the warning.
  it("warns once that a sampleless audio take can't be promoted, not once per position", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 1 });
    registerTakeLaneSource({ is_midi_clip: 0, is_audio_clip: 1 });

    const result = await duplicate({
      type: "clip",
      id: "tl_src_clip",
      arrangementStart: "1|1,2|1,3|1,4|1",
    });

    const promoteWarnings = vi
      .mocked(consoleMock.warn)
      .mock.calls.filter(([message]) =>
        String(message).includes("can't be promoted off its take lane"),
      );

    expect(promoteWarnings).toHaveLength(1);
    expect(result).toStrictEqual([]);
  });
});
