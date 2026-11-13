// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { type RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  registerNeighbourClip,
  setupResizableClip,
} from "#src/tools/clip/update/helpers/arrangement/resizable-clip-test-helpers.ts";
import { setupUpdateClipMocks } from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

/**
 * Put a 1-bar clip at bar 2 of track 0, after clip 789, which a temp clip laid
 * over it clears away, as Live does.
 * @param track - The track mock
 */
function registerNeighbour(track: RegisteredMockObject): void {
  registerNeighbourClip(track);

  const createMidiClip = track.methods.create_midi_clip as () => unknown;

  track.methods.create_midi_clip = () => {
    track.properties.arrangement_clips = children("789");

    return createMidiClip();
  };
}

describe("updateClip - arrangementLength (looped clip lengthening)", () => {
  beforeEach(() => {
    setupUpdateClipMocks();
  });

  it("grows the clip in place, keeping its loop", async () => {
    const { sourceClip, track } = setupResizableClip();

    const result = await updateClip({ id: "789", arrangementLength: "3bar" });

    // One clip, not copies of it.
    expect(result).toStrictEqual({ id: "789", path: "t0[1|1]" });
    expect(sourceClip.properties).toStrictEqual(
      expect.objectContaining({
        end_time: 12,
        looping: 1,
        loop_start: 0,
        loop_end: 4,
      }),
    );
    // Nothing was in the way, so nothing was laid to clear it.
    expect(track.call).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.anything(),
      expect.anything(),
    );
  });

  it("keeps a loop that starts after the start marker", async () => {
    const { sourceClip } = setupResizableClip({
      end_time: 3,
      loop_start: 1,
      loop_end: 4,
      start_marker: 0,
    });

    await updateClip({ id: "789", arrangementLength: "3bar" });

    expect(sourceClip.properties).toStrictEqual(
      expect.objectContaining({
        end_time: 12,
        loop_start: 1,
        loop_end: 4,
        start_marker: 0,
      }),
    );
  });

  it("leaves the clip as it is when the length is unchanged", async () => {
    const { sourceClip, track } = setupResizableClip();

    const result = await updateClip({ id: "789", arrangementLength: "1bar" });

    expect(result).toStrictEqual({ id: "789", path: "t0[1|1]" });
    expect(sourceClip.set).not.toHaveBeenCalled();
    expect(track.call).not.toHaveBeenCalled();
  });

  it("clears a clip in its way first, and says it overwrote it", async () => {
    const { sourceClip, track } = setupResizableClip();

    registerNeighbour(track);

    const result = await updateClip({ id: "789", arrangementLength: "3bar" });

    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 4, 8);
    expect(track.call).toHaveBeenCalledWith("delete_clip", "id temp_midi_1");
    expect(sourceClip.properties.end_time).toBe(12);
    expect(result).toStrictEqual({
      id: "789",
      path: "t0[1|1]",
      detail: "overwrote the clip at t0[2|1]",
    });
  });

  it("says where the clip landed when Live stopped it short", async () => {
    // Growth stops at beat 8, though nothing on the lane is there to clear.
    const { sourceClip } = setupResizableClip({}, 8);

    const result = await updateClip({ id: "789", arrangementLength: "3bar" });

    expect(sourceClip.properties.end_time).toBe(8);
    expect(result).toStrictEqual({
      id: "789",
      path: "t0[1|1]",
      detail: "arrangementLength landed at 2bar: Live stopped the clip there",
    });
  });

  // The neighbour is gone before the resize throws, so the entry says so.
  it("says what the clearing overwrote when the resize after it throws", async () => {
    const { sourceClip, track } = setupResizableClip();

    registerNeighbour(track);
    sourceClip.set.mockImplementation(() => {
      throw new Error("Live said no");
    });

    const result = await updateClip({ id: "789", arrangementLength: "3bar" });

    expect(track.call).toHaveBeenCalledWith("delete_clip", "id temp_midi_1");
    expect(result).toStrictEqual({
      id: "789",
      path: "t0[1|1]",
      detail: "Live said no; already changed: overwrote the clip at t0[2|1]",
    });
  });
});
