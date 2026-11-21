// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A re-created copy is resized to arrangementLength the way update-clip resizes
// any arrangement clip, and its entry says what the resize said.

import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../duplicate-mocks-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  maxError: vi.fn(),
  maxLog: vi.fn(),
  emitWarning: vi.fn(),
}));

import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import * as arrangementLength from "#src/tools/actions/duplicate/helpers/clip/arrangement-length.ts";
import {
  registerArrangementSource,
  registerLiveSet,
  registerTakeLaneSource,
} from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";

const AUDIO = { is_midi_clip: 0, is_audio_clip: 1, file_path: "/s/loop.wav" };
const STOPPED =
  "arrangementLength landed at 1bar: the next clip on the lane starts there";

/**
 * Stand in for update-clip's resize, answering with a detail.
 * @param detail - What the resize says about the copy
 * @returns The spy
 */
function spyOnResize(detail?: string) {
  return vi
    .spyOn(arrangementLength, "resizeCopy")
    .mockImplementation(async (id) => [
      { id, ...(detail != null && { detail }) },
    ]);
}

/**
 * Copy the source onto a fresh take lane, asking for a 2-bar length.
 * @param midi - Whether the source is a MIDI clip
 * @param postCreateFails - Whether filling the new clip fails
 * @returns The copy's entry
 */
async function laneCopy(
  midi: boolean,
  postCreateFails = false,
): Promise<{ id: string; detail?: string }> {
  registerTakeLaneTrack({
    initialLanes: 0,
    hasMidiInput: midi ? 1 : 0,
    postCreateFails,
  });

  return (await duplicate({
    type: "clip",
    id: "src_clip",
    arrangementStart: "5|1",
    takeLane: 1,
    arrangementLength: "2bar",
  })) as { id: string; detail?: string };
}

describe("a re-created copy sent an arrangementLength", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    registerLiveSet();
  });

  it("resizes a copy re-created on a take lane", async () => {
    registerArrangementSource(true, undefined, { extraProps: { end_time: 4 } });
    const resize = spyOnResize();

    const copy = await laneCopy(true);

    expect(resize).toHaveBeenCalledWith(
      copy.id,
      "2bar",
      undefined,
      undefined,
      expect.anything(),
    );
    expect(copy.detail).toBe("re-created on the take lane");
  });

  it("puts what the resize said on the copy's entry", async () => {
    registerArrangementSource(true, undefined, { extraProps: { end_time: 4 } });
    spyOnResize(STOPPED);

    const { detail } = await laneCopy(true);

    expect(detail).toBe(`re-created on the take lane; ${STOPPED}`);
  });

  // The copy is sized as asked, so the source's length is no longer news.
  it("drops an audio copy's length loss once it is resized", async () => {
    registerArrangementSource(false, undefined, {
      extraProps: { ...AUDIO, end_time: 16 },
    });
    spyOnResize();

    const { detail } = await laneCopy(false);

    expect(detail).not.toContain("length is");
  });

  it("doesn't resize a copy that failed partway", async () => {
    registerArrangementSource(true, undefined, { extraProps: { end_time: 4 } });
    const resize = spyOnResize();

    const { detail } = await laneCopy(true, true);

    expect(detail).toContain("the take-lane copy is incomplete");
    expect(detail).toContain("not resized");
    expect(resize).not.toHaveBeenCalled();
  });

  it("resizes a copy promoted off a take lane", async () => {
    registerTakeLaneTrack({ initialLanes: 1 });
    registerTakeLaneSource({ end_time: 4 });
    const resize = spyOnResize(STOPPED);

    const result = (await duplicate({
      type: "clip",
      id: "tl_src_clip",
      arrangementStart: "5|1",
      arrangementLength: "2bar",
    })) as { detail?: string };

    expect(resize).toHaveBeenCalledOnce();
    expect(result.detail).toContain(STOPPED);
  });

  // The pre-roll isn't part of a re-created copy, so a copy one loop later
  // doesn't bury it.
  it("copies a session clip onto a lane at its loop length", async () => {
    registerMockObject("src_clip", {
      path: livePath.track(0).clipSlot(0).clip(),
      type: "Clip",
      properties: {
        is_midi_clip: 1,
        is_arrangement_clip: 0,
        length: 4,
        loop_start: 2,
        loop_end: 6,
        start_marker: 0,
        end_marker: 6,
        looping: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
      methods: { get_notes_extended: () => JSON.stringify({ notes: [] }) },
    });
    registerTakeLaneTrack({ initialLanes: 0 });

    expect(
      await duplicate({
        type: "clip",
        id: "src_clip",
        toPath: "t0/l0[1|1],t0/l0[2|1]",
      }),
    ).toStrictEqual([
      {
        id: expect.any(String),
        path: "t0/l0[1|1]",
        created: "l0",
        detail: "re-created on the take lane",
      },
      {
        id: expect.any(String),
        path: "t0/l0[2|1]",
        detail: "re-created on the take lane",
      },
    ]);
  });
});
