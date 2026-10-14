// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { createNoteTrackingMethods } from "#src/test/helpers/mock-registry-test-helpers.ts";
import {
  type RegisteredMockObject,
  lookupMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_FAILURE,
  failOnSet,
  hookCalls,
} from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";
import { createClip } from "../../create-clip.ts";
import { setupDisplacingTrack } from "./create-clip-lane-mocks.ts";
import { mockScratchSwap } from "../create-clip-scratch-mocks.ts";
import { setupSessionAudioClipMocks } from "../create-clip-test-helpers.ts";

/** What a session set-up hands a test to break things with. */
interface Slots {
  liveSet: RegisteredMockObject;
  clips: RegisteredMockObject[];
}

/**
 * A MIDI track with one scene, and `slots` empty clip slots that each get a
 * clip the moment Live is asked to create one.
 * @param slots - How many slots t0 has
 * @param scenes - How many scenes the Live Set has to begin with
 * @returns The Live Set and each slot's clip
 */
function setUpSlots(slots: number, scenes = 1): Slots {
  let sceneIds = Array.from({ length: scenes }, (_, i) => `scene${i}`);
  const liveSet = registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  liveSet.get.mockImplementation((prop: string) =>
    prop === "scenes"
      ? sceneIds.flatMap((id) => ["id", id])
      : [prop.startsWith("signature") ? 4 : 0],
  );
  liveSet.call.mockImplementation((method: string) => {
    if (method === "create_scene") {
      sceneIds = [...sceneIds, `scene${sceneIds.length}`];
    }

    return null;
  });
  registerMockObject("track-0", {
    path: livePath.track(0),
    properties: { has_midi_input: 1 },
  });

  const clips = Array.from({ length: slots }, (_, i) => {
    registerMockObject(`slot-${i}`, {
      path: livePath.track(0).clipSlot(i),
      properties: { has_clip: 0 },
    });

    return registerMockObject(`clip-${i}`, {
      path: livePath.track(0).clipSlot(i).clip(),
      properties: { length: 4 },
      methods: createNoteTrackingMethods(),
    });
  });

  return { liveSet, clips };
}

/**
 * Make a call on a mock throw.
 * @param mock - The mock object
 * @param method - The Live API method that fails
 */
function failOnCall(mock: RegisteredMockObject, method: string): void {
  hookCalls(mock, new RegExp(`^${method}$`), {
    before: () => {
      throw new Error(LIVE_FAILURE);
    },
  });
}

// A clip that exists keeps its entry when a later step of its own write throws:
// its id and path, and a detail naming what landed and what stopped it. The
// destinations after it still get their turn.
describe("createClip - a step fails after the clip is made", () => {
  it("keeps a session clip whose properties Live refused", async () => {
    const { clips } = setUpSlots(3, 3);

    failOnSet(clips[1] as RegisteredMockObject, "name");

    const result = await createClip({
      path: "t0/s0,t0/s1,t0/s2",
      name: "A,B,C",
    });

    expect(result).toStrictEqual([
      { id: "clip-0", path: "t0/s0" },
      {
        id: "clip-1",
        path: "t0/s1",
        detail: `${LIVE_FAILURE}; already changed: clip created`,
      },
      { id: "clip-2", path: "t0/s2" },
    ]);
  });

  it("keeps a session clip whose notes Live refused", async () => {
    const { clips } = setUpSlots(2);

    failOnCall(clips[0] as RegisteredMockObject, "add_new_notes");

    const result = await createClip({ path: "t0/s0,t0/s1", notes: "C3 1|1" });

    expect(result).toStrictEqual([
      {
        id: "clip-0",
        path: "t0/s0",
        detail: `${LIVE_FAILURE}; already changed: clip created, properties`,
      },
      {
        id: "clip-1",
        path: "t0/s1",
        created: "s1",
        noteCount: 1,
        length: "1bar",
      },
    ]);
  });

  it("names the scenes made to reach the slot", async () => {
    const { clips } = setUpSlots(3);

    failOnSet(clips[2] as RegisteredMockObject, "name");

    const result = await createClip({ path: "t0/s2", name: "Far" });

    expect(result).toStrictEqual({
      id: "clip-2",
      path: "t0/s2",
      created: "s1-s2",
      detail: `${LIVE_FAILURE}; already changed: created scenes s1-s2, clip created`,
    });
  });

  describe("on a slot that already holds a clip", () => {
    /**
     * An occupied t0/s0 whose replacement is built in a scratch slot.
     * @returns The scratch slot, and the Live Set
     */
    function setUpReplace(
      buildFails = false,
    ): Slots & { scratch: RegisteredMockObject } {
      const slots = setUpSlots(1);

      (lookupMockObject("slot-0") as RegisteredMockObject).properties.has_clip =
        1;

      const scratch = mockScratchSwap(0, 1, 0, { id: "new_clip", buildFails });

      // The scratch clip is still there when the copy has landed.
      scratch.properties.has_clip = 1;

      return { ...slots, scratch };
    }

    it("keeps the replacement when the scratch clip can't be cleared", async () => {
      const { scratch } = setUpReplace();

      failOnCall(scratch, "delete_clip");

      expect(await createClip({ path: "t0/s0" })).toStrictEqual({
        id: "new_clip",
        path: "t0/s0",
        detail:
          `overwrote the existing clip at t0/s0; ` +
          `couldn't clear the scratch clip at t0/s1: ${LIVE_FAILURE}`,
      });
    });

    // Nothing replaced the clip there, and the scratch clip is left behind too.
    it("names the scratch clip it couldn't clear when the replacement never landed", async () => {
      const { scratch } = setUpReplace(true);

      failOnCall(scratch, "delete_clip");

      await expect(createClip({ path: "t0/s0" })).rejects.toThrow(
        "Live created no clip at t0/s0; the clip at t0/s0 was not touched; " +
          `couldn't clear the scratch clip at t0/s1: ${LIVE_FAILURE}`,
      );
    });

    it("keeps the replacement when the scratch scene can't be removed", async () => {
      const { liveSet } = setUpReplace();

      failOnCall(liveSet, "delete_scene");

      expect(await createClip({ path: "t0/s0" })).toStrictEqual({
        id: "new_clip",
        path: "t0/s0",
        detail:
          `overwrote the existing clip at t0/s0; ` +
          `couldn't remove the scratch scene: ${LIVE_FAILURE}`,
      });
    });

    it("keeps the replacement when its name is then refused", async () => {
      const { scratch } = setUpReplace();

      // The copy puts the new clip in the slot; its name is refused after.
      hookCalls(scratch, /^duplicate_clip_to$/, {
        after: () =>
          failOnSet(
            lookupMockObject("new_clip") as RegisteredMockObject,
            "name",
          ),
      });

      expect(await createClip({ path: "t0/s0", name: "X" })).toStrictEqual({
        id: "new_clip",
        path: "t0/s0",
        detail:
          `${LIVE_FAILURE}; already changed: clip created, ` +
          "overwrote the existing clip at t0/s0",
      });
    });
  });

  describe("in the arrangement", () => {
    it("names the clips the new one went over", async () => {
      setupDisplacingTrack(
        [{ id: "old", start: 12, end: 16 }],
        [{ id: "made", start: 12, end: 16 }],
        [
          { id: "made", start: 12, end: 16 },
          { id: "made2", start: 28, end: 32 },
        ],
      );
      failOnSet(lookupMockObject("made") as RegisteredMockObject, "name");

      const result = await createClip({
        path: "t0[4|1],t0[8|1]",
        length: "1bar",
        name: "A,B",
      });

      expect(result).toStrictEqual([
        {
          id: "made",
          path: "t0[4|1]",
          detail: `${LIVE_FAILURE}; already changed: clip created, overwrote the clip at t0[4|1]`,
        },
        { id: "made2", path: "t0[8|1]" },
      ]);
    });

    /**
     * Make the lane unreadable once the clip is made, so what it cost can't be
     * worked out.
     */
    function breakLaneReads(): void {
      const track = lookupMockObject("track-0") as RegisteredMockObject;

      hookCalls(track, /^create_midi_clip$/, {
        after: () =>
          track.get.mockImplementation(() => {
            throw new Error(LIVE_FAILURE);
          }),
      });
    }

    it("keeps the clip when what it cost the lane can't be read", async () => {
      setupDisplacingTrack([], [{ id: "made", start: 12, end: 16 }]);
      breakLaneReads();

      expect(await createClip({ path: "t0[4|1]" })).toStrictEqual({
        id: "made",
        path: "t0[4|1]",
        detail: `${LIVE_FAILURE}; already changed: clip created, properties`,
      });
    });

    it("reports the step that failed, not the lane it then couldn't read", async () => {
      setupDisplacingTrack([], [{ id: "made", start: 12, end: 16 }]);
      breakLaneReads();
      failOnSet(lookupMockObject("made") as RegisteredMockObject, "name");

      expect(await createClip({ path: "t0[4|1]", name: "X" })).toStrictEqual({
        id: "made",
        path: "t0[4|1]",
        detail: `${LIVE_FAILURE}; already changed: clip created`,
      });
    });

    it("keeps an arrangement clip whose notes Live refused", async () => {
      setupDisplacingTrack([], [{ id: "made", start: 12, end: 16 }]);
      failOnCall(
        lookupMockObject("made") as RegisteredMockObject,
        "add_new_notes",
      );

      const result = await createClip({ path: "t0[4|1]", notes: "C3 1|1" });

      expect(result).toStrictEqual({
        id: "made",
        path: "t0[4|1]",
        detail: `${LIVE_FAILURE}; already changed: clip created, properties`,
      });
    });
  });

  describe("an audio clip", () => {
    it("keeps the clip when its audio properties are refused", async () => {
      const { clip } = setupSessionAudioClipMocks();

      failOnSet(clip, "gain");

      const result = await createClip({
        path: "t0/s0",
        sampleFile: "/samples/a.wav",
        name: "Loop",
        gainDb: -6,
      });

      expect(result).toStrictEqual({
        id: "audio_clip_0_0",
        path: "t0/s0",
        detail: `${LIVE_FAILURE}; already changed: clip created, properties`,
      });
    });

    it("keeps the clip when its warp state is refused", async () => {
      const { clip } = setupSessionAudioClipMocks();

      failOnSet(clip, "warping");

      const result = await createClip({
        path: "t0/s0",
        sampleFile: "/samples/a.wav",
        gainDb: -6,
        warping: true,
      });

      expect(result).toStrictEqual({
        id: "audio_clip_0_0",
        path: "t0/s0",
        detail: `${LIVE_FAILURE}; already changed: clip created, audio properties`,
      });
    });
  });
});

describe("createClip - a destination that can't take its clip", () => {
  it("skips a destination on a track that isn't there and makes the rest", async () => {
    mockNonExistentObjects();
    setUpSlots(1);

    const result = await createClip({ path: "t9/s0,t0/s0" });

    expect(result).toStrictEqual([
      {
        path: "t9/s0",
        ok: false,
        detail: 'no track at path "t9"; ppal-create-track adds tracks',
      },
      { id: "clip-0", path: "t0/s0" },
    ]);
  });
});
