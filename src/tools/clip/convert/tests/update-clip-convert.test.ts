// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip's `convert` param: one audio clip becomes a new track, found by
// comparing track lists since Live makes it after the route has answered.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { CONVERT_ROUTE } from "#src/tools/clip/convert/remote-script-convert-contract.ts";
import {
  setupArrangementAudioClipMock,
  setupAudioClipMock,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { createNoteTrackingMethods } from "#src/test/helpers/mock-registry-test-helpers.ts";

/** What the remote script is told to say when it is too old. */
const OUTDATED =
  "the Producer Pal remote script is out of date (running 2.4.0, needs 2.5.0 or later)";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

/** The tracks the Live Set starts with: the clips' tracks, t0 to t3. */
const OLD_TRACKS = ["id", "100", "id", "101", "id", "102", "id", "103"];

describe("updateClip - convert", () => {
  let mocks: UpdateClipMocks;
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    setupAudioClipMock(mocks.clip123);
    liveSet = registerMockObject("live-set", {
      path: "live_set",
      type: "Song",
      properties: {
        tracks: OLD_TRACKS,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });
    mockNonExistentObjects();
    vi.mocked(requestNode).mockReset();
  });

  /**
   * Answer the route, and let `made` make what Live makes a moment later.
   * @param made - Runs when the route is called
   * @param reply - What the route answers
   */
  function answerRoute(made?: () => void, reply?: unknown) {
    vi.mocked(requestNode).mockImplementation((route) => {
      if (route === CONVERT_ROUTE) {
        made?.();
      }

      return Promise.resolve({
        success: true,
        result: reply ?? { available: true },
      });
    });
  }

  /**
   * Add a track to the end of the list, at the index it lands on.
   * @param id - The new track's id
   * @param index - Its place in the list
   */
  function addTrack(id: string, index: number): RegisteredMockObject {
    const track = registerMockObject(id, {
      path: livePath.track(index),
      type: "Track",
    });

    liveSet.properties.tracks = [
      ...(liveSet.properties.tracks as string[]),
      "id",
      id,
    ];

    return track;
  }

  /**
   * A MIDI clip on a new track's slot.
   * @param id - The clip's id
   * @param trackIndex - Its track
   * @param noteCount - How many notes it holds
   */
  function addSlotClip(
    id: string,
    trackIndex: number,
    noteCount: number,
  ): void {
    const methods = createNoteTrackingMethods();
    const clip = registerMockObject(id, {
      path: livePath.track(trackIndex).clipSlot(0).clip(),
      methods,
    });

    setupMidiClipMock(clip);
    methods.add_new_notes?.({
      notes: Array.from({ length: noteCount }, (_, i) => ({
        pitch: 36,
        start_time: i,
        duration: 1,
        velocity: 100,
      })),
    });
  }

  /**
   * The args the convert route was called with.
   * @returns Its args, or undefined when it was never called
   */
  function routeArgs(): unknown {
    return vi
      .mocked(requestNode)
      .mock.calls.find((call) => call[0] === CONVERT_ROUTE)?.[1];
  }

  it("sends a session clip's track and slot, and reports the new track and clip", async () => {
    answerRoute(() => {
      addTrack("200", 4);
      addSlotClip("300", 4, 3);
    });

    const result = await updateClip({ id: "123", convert: "drums" });

    expect(routeArgs()).toStrictEqual(
      expect.objectContaining({ track: "t0", slot: 0, type: "drums" }),
    );
    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      converted: {
        track: { id: "200", path: "t4" },
        clip: { id: "300", path: "t4/s0", noteCount: 3 },
      },
    });
  });

  it("reports a clip with no notes as a clip with none, not a failure", async () => {
    answerRoute(() => {
      addTrack("200", 4);
      addSlotClip("300", 4, 0);
    });

    const result = await updateClip({ id: "123", convert: "melody" });

    expect(result).toStrictEqual(
      expect.objectContaining({
        converted: expect.objectContaining({
          clip: expect.objectContaining({ noteCount: 0 }),
        }),
      }),
    );
  });

  it("reports only the track for simpler and drum-rack, which make no clip", async () => {
    answerRoute(() => addTrack("200", 4));

    const result = await updateClip({ id: "123", convert: "drum-rack" });

    expect(routeArgs()).toStrictEqual(
      expect.objectContaining({ type: "drum-rack" }),
    );
    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      converted: { track: { id: "200", path: "t4" } },
    });
  });

  it("finds an arrangement clip's MIDI clip where the source started", async () => {
    setupArrangementAudioClipMock(mocks.clip789, { start_time: 16 });
    answerRoute(() => {
      addTrack("200", 4);
      const clip = registerMockObject("300", {
        path: livePath.track(4).arrangementClip(0),
        methods: createNoteTrackingMethods(),
      });

      setupMidiClipMock(clip, { is_arrangement_clip: 1, start_time: 16 });
      registerMockObject("200", {
        path: livePath.track(4),
        type: "Track",
        properties: { arrangement_clips: ["id", "300"] },
      });
    });

    const result = await updateClip({ id: "789", convert: "harmony" });

    expect(routeArgs()).toStrictEqual(
      expect.objectContaining({ track: "t2", arrangementIndex: 0 }),
    );
    expect(result).toStrictEqual(
      expect.objectContaining({
        converted: expect.objectContaining({
          clip: expect.objectContaining({ id: "300", noteCount: 0 }),
        }),
      }),
    );
  });

  it("says the track has no clip where expected, still reporting the track", async () => {
    answerRoute(() => addTrack("200", 4));

    const result = await updateClip({ id: "123", convert: "drums" });

    expect(result).toStrictEqual(
      expect.objectContaining({
        converted: { track: { id: "200", path: "t4" } },
        detail: "the new track has no MIDI clip where this clip was",
      }),
    );
  });

  it("keeps the entry when no track ever appears, saying it was started", async () => {
    answerRoute();

    const result = await updateClip({ id: "123", convert: "simpler" });

    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      detail:
        "the conversion was started, but no new track has appeared yet; look for the new track before converting again",
    });
  });

  it("keeps the entry when the route never answered, saying it may not have started", async () => {
    vi.mocked(requestNode).mockResolvedValue({ success: false, error: "gone" });

    const result = await updateClip({ id: "123", convert: "simpler" });

    expect(result).toStrictEqual(
      expect.objectContaining({
        detail: expect.stringContaining(
          "the conversion may or may not have started",
        ),
      }),
    );
  });

  it("reports the track found even when the route timed out after Live took the job", async () => {
    answerRoute(() => addTrack("200", 4), {
      available: true,
      error: "timed out",
      unfinished: true,
    });

    const result = await updateClip({ id: "123", convert: "simpler" });

    expect(result).toStrictEqual(
      expect.objectContaining({
        converted: { track: { id: "200", path: "t4" } },
      }),
    );
  });

  it("names the tracks and reports none as the clip's when several appear", async () => {
    answerRoute(() => {
      addTrack("200", 4);
      addTrack("201", 5);
    });

    const result = await updateClip({ id: "123", convert: "simpler" });

    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      detail:
        "2 new tracks appeared (t4, t5), so which one came from this clip is unclear",
    });
  });

  it("re-reads the clip's path when the new track lands ahead of it", async () => {
    answerRoute(() => {
      addTrack("200", 0);
      mocks.clip123.path = livePath.track(1).clipSlot(0).clip();
    });

    const result = await updateClip({ id: "123", convert: "simpler" });

    expect(result).toStrictEqual(expect.objectContaining({ path: "t1/s0" }));
  });

  it("converts each clip of a call, and one that can't be doesn't stop the rest", async () => {
    setupMidiClipMock(mocks.clip456);
    answerRoute(() => addTrack("200", 4));

    const result = await updateClip({ id: "456,123", convert: "simpler" });

    expect(result).toStrictEqual([
      {
        id: "456",
        ok: false,
        detail: "not converted: only an audio clip can be converted",
      },
      expect.objectContaining({
        id: "123",
        converted: { track: { id: "200", path: "t4" } },
      }),
    ]);
    expect(vi.mocked(requestNode)).toHaveBeenCalledTimes(1);
  });

  it("skips the rest of the call's conversions once one shows no track", async () => {
    setupAudioClipMock(mocks.clip456);
    answerRoute();

    const result = await updateClip({ id: "123,456", convert: "simpler" });

    expect(result).toStrictEqual([
      expect.objectContaining({
        id: "123",
        detail: expect.stringContaining("no new track has appeared yet"),
      }),
      {
        id: "456",
        ok: false,
        detail:
          "not converted: an earlier conversion in this call didn't show its new track, so this one wasn't started; re-run it",
      },
    ]);
    expect(requestNode).toHaveBeenCalledTimes(1);
  });

  it("skips the rest too when several tracks appeared", async () => {
    setupAudioClipMock(mocks.clip456);
    answerRoute(() => {
      addTrack("200", 4);
      addTrack("201", 5);
    });

    const result = (await updateClip({
      id: "123,456",
      convert: "simpler",
    })) as Array<{ ok?: boolean }>;

    expect(result[1]?.ok).toBe(false);
    expect(requestNode).toHaveBeenCalledTimes(1);
  });

  it("reads every path again at the end, since a later track shifts them", async () => {
    setupAudioClipMock(mocks.clip456);

    let calls = 0;
    let first: RegisteredMockObject | undefined;

    answerRoute(() => {
      calls += 1;

      if (calls === 1) {
        first = addTrack("200", 4);

        return;
      }

      // The second conversion's track lands ahead of everything.
      addTrack("201", 0);
      mocks.clip123.path = livePath.track(1).clipSlot(0).clip();
      mocks.clip456.path = livePath.track(2).clipSlot(1).clip();

      if (first != null) {
        first.path = "live_set tracks 5";
      }
    });

    const result = await updateClip({ id: "123,456", convert: "simpler" });

    expect(result).toStrictEqual([
      {
        id: "123",
        path: "t1/s0",
        converted: { track: { id: "200", path: "t5" } },
      },
      {
        id: "456",
        path: "t2/s1",
        converted: { track: { id: "201", path: "t0" } },
      },
    ]);
  });

  it("converts the clip as the same call left it", async () => {
    answerRoute(() => addTrack("200", 4));

    await updateClip({ id: "123", gainDb: -6, convert: "simpler" });

    const order = [
      mocks.clip123.set.mock.invocationCallOrder[0],
      vi.mocked(requestNode).mock.invocationCallOrder[0],
    ];

    expect(order[0]).toBeLessThan(order[1] as number);
  });

  describe("refusals", () => {
    it("refuses a MIDI clip without calling the remote script", async () => {
      setupMidiClipMock(mocks.clip123);

      await expect(updateClip({ id: "123", convert: "drums" })).rejects.toThrow(
        "not converted: only an audio clip can be converted",
      );
      expect(requestNode).not.toHaveBeenCalled();
    });

    it("passes on what the remote script refused with", async () => {
      answerRoute(undefined, {
        available: true,
        error: "Live can't convert this clip to MIDI",
      });

      await expect(
        updateClip({ id: "123", convert: "melody" }),
      ).rejects.toThrow("not converted: Live can't convert this clip to MIDI");
    });

    it("refuses without the remote script, saying how to get it", async () => {
      answerRoute(undefined, { available: false });

      await expect(updateClip({ id: "123", convert: "drums" })).rejects.toThrow(
        /converting a clip needs the Producer Pal remote script.*Settings/,
      );
    });

    it("says so when the remote script is out of date", async () => {
      answerRoute(undefined, { available: false, outdated: OUTDATED });

      await expect(updateClip({ id: "123", convert: "drums" })).rejects.toThrow(
        OUTDATED,
      );
    });

    it("keeps the rest of the update's entry when only the conversion is refused", async () => {
      answerRoute(undefined, { available: false });

      const result = await updateClip({
        id: "123",
        gainDb: -6,
        convert: "drums",
      });

      expect(result).toStrictEqual(
        expect.objectContaining({
          id: "123",
          detail: expect.stringContaining(
            "needs the Producer Pal remote script",
          ),
        }),
      );
    });

    it("refuses when the request has no time left, before asking Live", async () => {
      await expect(
        updateClip(
          { id: "123", convert: "drums" },
          { deadline: Date.now() + 100 },
        ),
      ).rejects.toThrow(
        "not converted: the request ran out of time; re-run for this clip",
      );
      expect(requestNode).not.toHaveBeenCalled();
    });

    it("refuses a conversion beside a split, before touching anything", async () => {
      await expect(
        updateClip({ id: "123", convert: "drums", arrangementSplit: "2|1" }),
      ).rejects.toThrow(/convert cannot be combined with arrangementSplit/);
      expect(requestNode).not.toHaveBeenCalled();
    });

    it.each([
      ["toPath", { toPath: "t4/s1" }],
      ["toSlot", { toSlot: "4/1" }],
      ["arrangementStart", { arrangementStart: "5|1" }],
    ])(
      "refuses a conversion beside %s, before touching anything",
      async (param, args) => {
        await expect(
          updateClip({ id: "123", convert: "drums", ...args }),
        ).rejects.toThrow(`convert cannot be combined with ${param}`);
        expect(requestNode).not.toHaveBeenCalled();
      },
    );

    it("refuses a clip in a take lane", async () => {
      setupArrangementAudioClipMock(
        registerMockObject("999", {
          path: livePath.track(3).takeLane(0).arrangementClip(0),
        }),
      );

      await expect(updateClip({ id: "999", convert: "drums" })).rejects.toThrow(
        /only a clip in a session slot or on a track's main/,
      );
    });
  });
});
