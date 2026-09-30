// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  setupAudioClipMock,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

interface Region {
  looping: number;
  start_marker: number;
  loop_start: number;
  end_marker: number;
  loop_end: number;
}

const LOOPING_8: Region = {
  looping: 1,
  start_marker: 0,
  loop_start: 0,
  end_marker: 8,
  loop_end: 8,
};

const PLAIN_8: Region = { ...LOOPING_8, looping: 0 };

/**
 * A MIDI clip with the given region, holding notes at the given beats. Writes
 * update the region, and its length follows it, as in Live.
 * @param mocks - The update-clip mocks
 * @param region - The region the clip starts with
 * @param starts - Start beats of the notes the clip holds
 */
function setupClip(
  mocks: UpdateClipMocks,
  region: Region,
  starts: number[],
): void {
  const state: Record<string, number> = {
    ...region,
    is_midi_clip: 1,
    signature_numerator: 4,
    signature_denominator: 4,
  };
  let held = starts;

  setupMidiClipMock(mocks.clip123, {});
  mocks.clip123.get.mockImplementation((prop: string) => [
    prop === "length"
      ? state.looping
        ? state.loop_end! - state.loop_start!
        : state.end_marker! - state.start_marker!
      : (state[prop] ?? 0),
  ]);
  mocks.clip123.set.mockImplementation((prop: string, value: number) => {
    state[prop] = value;
  });
  mocks.clip123.call.mockImplementation(
    (method: string, ...args: unknown[]) => {
      const [, , from, span] = args as number[];
      const inWindow = (beat: number) => beat >= from! && beat < from! + span!;

      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: held.filter(inWindow).map((start_time) => ({
            pitch: 60,
            start_time,
            duration: 1,
            velocity: 100,
            probability: 1,
            velocity_deviation: 0,
            mute: 0,
            release_velocity: 0,
          })),
        });
      }

      if (method === "remove_notes_extended") {
        held = held.filter((beat) => !inWindow(beat));
      }

      if (method === "add_new_notes") {
        const { notes } = args[0] as { notes: { start_time: number }[] };

        held = [...held, ...notes.map((n) => n.start_time)];
      }

      return {};
    },
  );
}

describe("updateClip - notes outside the region", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  it.each([
    ["looping", LOOPING_8],
    ["non-looping", PLAIN_8],
  ])("counts notes a shrink-only length cuts off (%s)", async (_, region) => {
    setupClip(mocks, region, [0, 5]);

    const result = await updateClip({
      id: "123",
      length: "1bar",
      notes: "C3 1|1",
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        detail: "1 note is outside the region and won't play",
      }),
    );
  });

  it("counts notes a small start move leaves behind", async () => {
    setupClip(mocks, LOOPING_8, [0, 1, 6]);

    const result = await updateClip({
      id: "123",
      start: "2|1",
      length: "1bar",
      notes: "C3 2|1",
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        detail: "2 notes are outside the region and won't play",
      }),
    );
  });

  it("says nothing when looping is switched off, since the region carries over", async () => {
    setupClip(mocks, { ...LOOPING_8, end_marker: 2 }, [0, 5]);

    const result = await updateClip({
      id: "123",
      looping: false,
      notes: "C3 1|1",
    });

    expect(result).not.toHaveProperty("detail");
  });

  it("counts a note the edit itself places outside the region", async () => {
    setupClip(mocks, LOOPING_8, [0]);

    const result = await updateClip({
      id: "123",
      length: "1bar",
      notes: "C3 5|1",
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        detail: "1 note is outside the region and won't play",
      }),
    );
  });

  it("says nothing when firstStart leaves every note inside the region", async () => {
    setupClip(mocks, LOOPING_8, [0, 5]);

    const result = await updateClip({
      id: "123",
      firstStart: "2|1",
      notes: "C3 1|1",
    });

    expect(result).not.toHaveProperty("detail");
  });

  it("says nothing when the region doesn't change", async () => {
    setupClip(mocks, LOOPING_8, [0, 9]);

    const result = await updateClip({ id: "123", notes: "C3 1|1" });

    expect(result).not.toHaveProperty("detail");
  });

  it("says nothing when the call edits no notes", async () => {
    setupClip(mocks, LOOPING_8, [0, 5]);

    const result = await updateClip({ id: "123", length: "1bar" });

    expect(result).not.toHaveProperty("detail");
  });

  it("says nothing on an audio clip", async () => {
    setupAudioClipMock(
      mocks.clip123,
      LOOPING_8 as unknown as Record<string, unknown>,
    );

    const result = await updateClip({
      id: "123",
      length: "1bar",
      notes: "C3 1|1",
    });

    expect(JSON.stringify(result)).not.toContain("won't play");
  });
});
