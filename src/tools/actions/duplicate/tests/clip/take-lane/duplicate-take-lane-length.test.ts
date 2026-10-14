// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A re-created copy ignores arrangementLength, and says it keeps the source's
// arrangement length only when that was read back.

import { describe, expect, it, vi } from "vitest";
import "../../duplicate-mocks-test-helpers.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerArrangementSource,
  registerLiveSet,
  registerTakeLaneSource,
} from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";

const KEPT =
  "arrangementLength ignored: the copy keeps the source's arrangement length";
const IGNORED = "arrangementLength ignored: a re-created copy isn't resized";
const AUDIO = { is_midi_clip: 0, is_audio_clip: 1, file_path: "/s/loop.wav" };

/**
 * Copy the source onto a fresh take lane, asking for a 2-bar length.
 * @param midi - Whether the source is a MIDI clip
 * @param clipLength - The length Live gives an audio copy, in beats
 * @returns The copy's entry detail
 */
async function laneCopyDetail(
  midi: boolean,
  clipLength?: number,
): Promise<string | undefined> {
  registerTakeLaneTrack({
    initialLanes: 0,
    hasMidiInput: midi ? 1 : 0,
    clipLength,
  });

  const result = (await duplicate({
    type: "clip",
    id: "src_clip",
    arrangementStart: "5|1",
    takeLane: 1,
    arrangementLength: "2bar",
  })) as { detail?: string };

  return result.detail;
}

describe("a re-created copy sent an arrangementLength", () => {
  it("says the copy keeps the source's arrangement length for a MIDI arrangement clip", async () => {
    registerLiveSet();
    registerArrangementSource(true, undefined, { extraProps: { end_time: 4 } });

    expect(await laneCopyDetail(true)).toContain(KEPT);
  });

  it("says so for an audio clip whose copy came out the same length", async () => {
    registerLiveSet();
    registerArrangementSource(false, undefined, {
      extraProps: { ...AUDIO, end_time: 4 },
    });

    // The mock's new audio clip is 4 beats, the source's span.
    expect(await laneCopyDetail(false)).toContain(KEPT);
  });

  // The loss already says the copy's length, so the ignored note must not add
  // a second, contradicting one.
  it("states the length once for an audio clip whose copy came out different", async () => {
    registerLiveSet();
    registerArrangementSource(false, undefined, {
      extraProps: { ...AUDIO, end_time: 16 },
    });

    const detail = await laneCopyDetail(false);

    expect(detail).toContain(
      "length is 1bar, not 4bar: Live rebuilds an audio clip from its sample",
    );
    expect(detail).toContain(IGNORED);
    expect(detail).not.toContain("arrangement length");
    expect(detail?.match(/length is /g)).toHaveLength(1);
  });

  it("says only that it was ignored for a session clip, which has no arrangement length", async () => {
    registerLiveSet();
    registerArrangementSource(true, undefined, {
      extraProps: { is_arrangement_clip: 0, end_time: 4 },
    });

    const detail = await laneCopyDetail(true);

    expect(detail).toContain(IGNORED);
    expect(detail).not.toContain("arrangement length");
  });

  it("makes no kept-length claim when the copy's span can't be read", async () => {
    registerLiveSet();
    registerArrangementSource(false, undefined, {
      extraProps: { ...AUDIO, end_time: 4 },
    });

    const detail = await laneCopyDetail(false, Number.NaN);

    expect(detail).toContain(IGNORED);
    expect(detail).not.toContain("arrangement length");
  });

  it("says the copy keeps the source's arrangement length for a MIDI clip promoted off a take lane", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 1 });
    registerTakeLaneSource({ end_time: 4 });

    const result = (await duplicate({
      type: "clip",
      id: "tl_src_clip",
      arrangementStart: "5|1",
      arrangementLength: "2bar",
    })) as { detail?: string };

    expect(result.detail).toContain(KEPT);
  });
});
