// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A copy onto another track says which device envelopes Live's copy dropped.
// Every duplicate path that lands a clip on another track is driven here, so a
// new one can't skip it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerArrangementClip,
  registerTrackWithArrangementDup,
} from "#src/tools/actions/duplicate/helpers/duplicate-arrangement-test-helpers.ts";
import {
  answerEnvelopeList,
  expectOneReadThenHedges,
  FREQUENCY_ENVELOPE,
  MACRO_ENVELOPE,
  PAN_ENVELOPE,
} from "#src/tools/clip/tests/envelope-clips/envelope-write-test-helpers.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import { UNNAMED_ENVELOPE_LOSS } from "#src/tools/clip/envelopes/cross-track-envelopes.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

const NOTE =
  "dropped the device envelopes, which don't copy to another track: Frequency (t0/d1)";

/**
 * A MIDI clip in t0/s0, whose slot copies into the empty slots registered here.
 * @param hasEnvelopes - The clip's `has_envelopes` flag
 * @returns The copies Live has made, by destination slot path
 */
function registerSessionWorld(
  hasEnvelopes: number,
): Map<string, RegisteredMockObject> {
  const copies = new Map<string, RegisteredMockObject>();
  const destinations = [
    [0, 1],
    [1, 1],
    [2, 1],
  ] as const;

  mockNonExistentObjects();
  registerMockObject("clip1", {
    path: livePath.track(0).clipSlot(0).clip(),
    properties: { is_midi_clip: 1, has_envelopes: hasEnvelopes },
  });
  registerMockObject("live_set/tracks/0/clip_slots/0", {
    path: livePath.track(0).clipSlot(0),
    properties: { has_clip: 1 },
    methods: {
      duplicate_clip_to: (target) => {
        const match = /^id slot-(\d+)-(\d+)$/.exec(String(target));
        const [track, scene] = [Number(match?.[1]), Number(match?.[2])];

        copies.set(
          `t${track}/s${scene}`,
          registerMockObject(`copy-${track}-${scene}`, {
            path: livePath.track(track).clipSlot(scene).clip(),
          }),
        );

        return null;
      },
    },
  });

  for (const [track, scene] of destinations) {
    registerMockObject(`track-${track}`, {
      path: livePath.track(track),
      properties: { has_midi_input: 1, is_frozen: 0 },
    });
    registerMockObject(`slot-${track}-${scene}`, {
      path: livePath.track(track).clipSlot(scene),
      properties: { has_clip: 0 },
    });
  }

  return copies;
}

describe("ppal-duplicate - a session clip copied to another track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    answerEnvelopeList([FREQUENCY_ENVELOPE, PAN_ENVELOPE]);
  });

  it("names the device envelopes it dropped, and not the mixer ones", async () => {
    registerSessionWorld(1);

    const result = (await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t1/s1",
    })) as Record<string, unknown>;

    expect(result).toStrictEqual(
      expect.objectContaining({ path: "t1/s1", detail: NOTE }),
    );
    expect(requestNode).toHaveBeenCalledWith(
      ENVELOPE_ROUTES.list,
      { track: "t0", slot: 0 },
      expect.any(Number),
    );
  });

  it("asks once for a clip copied to several tracks, and names it on each", async () => {
    registerSessionWorld(1);

    const result = (await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t1/s1,t2/s1",
    })) as Array<Record<string, unknown>>;

    expect(result.map((entry) => entry.detail)).toStrictEqual([NOTE, NOTE]);
    expect(requestNode).toHaveBeenCalledTimes(1);
  });

  it("reads each source clip of a call once, and names its own envelopes", async () => {
    registerSessionWorld(1);
    registerMockObject("clip2", {
      path: livePath.track(0).clipSlot(2).clip(),
      properties: { is_midi_clip: 1, has_envelopes: 1 },
    });
    registerMockObject("live_set/tracks/0/clip_slots/2", {
      path: livePath.track(0).clipSlot(2),
      properties: { has_clip: 1 },
      methods: {
        duplicate_clip_to: (target) => {
          const [, track, scene] = /^id slot-(\d+)-(\d+)$/.exec(
            String(target),
          ) as RegExpExecArray;

          registerMockObject(`second-${track}-${scene}`, {
            path: livePath.track(Number(track)).clipSlot(Number(scene)).clip(),
          });

          return null;
        },
      },
    });
    vi.mocked(requestNode).mockImplementation((_route, args) =>
      Promise.resolve({
        success: true,
        result: {
          available: true,
          result: {
            envelopes: [
              (args as { slot: number }).slot === 0
                ? FREQUENCY_ENVELOPE
                : MACRO_ENVELOPE,
            ],
          },
        },
      }),
    );

    const result = (await duplicate({
      type: "clip",
      id: "clip1,clip2",
      toPath: "t1/s1,t2/s1",
    })) as Array<{ detail?: string }>;
    const details = result.map((entry) => entry.detail);

    expect(details).toStrictEqual([
      NOTE,
      "dropped the device envelopes, which don't copy to another track: Macro 1 (t0/d0)",
    ]);
    expect(requestNode).toHaveBeenCalledTimes(2);
  });

  it("goes straight to the hedge for the rest of a call once a read stalls", async () => {
    registerSessionWorld(1);

    await expectOneReadThenHedges(() =>
      duplicate({ type: "clip", id: "clip1", toPath: "t1/s1,t2/s1" }),
    );
  });

  it("hedges when the remote script can't list them", async () => {
    registerSessionWorld(1);
    answerEnvelopeList(null);

    const result = (await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t1/s1",
    })) as Record<string, unknown>;

    expect(result.detail).toBe(UNNAMED_ENVELOPE_LOSS);
  });

  it("says nothing, and doesn't ask, for a clip with no envelopes", async () => {
    registerSessionWorld(0);

    const result = await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t1/s1",
    });

    expect(result).not.toHaveProperty("detail");
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("says nothing, and doesn't ask, for a copy on its own track", async () => {
    registerSessionWorld(1);

    const result = await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t0/s1",
    });

    expect(result).not.toHaveProperty("detail");
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("keeps the note on the entry when something throws after the copy landed", async () => {
    registerSessionWorld(1);

    // The copy exists once Live makes it; naming it is what then fails.
    const setAll = vi
      .spyOn(LiveAPI.prototype, "setAll")
      .mockImplementation(() => {
        throw new Error("Live refused to name it");
      });

    const result = (await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t1/s1",
      name: "Copy",
    })) as Record<string, unknown>;

    setAll.mockRestore();
    expect(result.detail).toBe(
      `${NOTE}; the copy landed, but Live refused to name it`,
    );
  });
});

describe("ppal-duplicate - an arrangement clip copied to another track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    answerEnvelopeList([FREQUENCY_ENVELOPE, PAN_ENVELOPE]);
  });

  /**
   * An arrangement clip on t0, and where its copies land on t0 and t2.
   * @param hasEnvelopes - The clip's `has_envelopes` flag
   */
  function registerWorld(hasEnvelopes: number): void {
    registerMockObject("clip1", {
      path: livePath.track(0).arrangementClip(5),
      properties: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        has_envelopes: hasEnvelopes,
        start_time: 0,
        length: 4,
      },
    });
    registerTrackWithArrangementDup(0);
    registerTrackWithArrangementDup(2, { has_midi_input: 1 });
    registerArrangementClip(0, 0, 8);
    registerArrangementClip(2, 0, 8);
  }

  it("says any device envelopes were dropped, without asking", async () => {
    registerWorld(1);

    const result = (await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "3|1",
      toPath: "t2",
    })) as Record<string, unknown>;

    expect(result.detail).toBe(UNNAMED_ENVELOPE_LOSS);
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("says it for a copy at another length, too", async () => {
    registerWorld(1);

    const result = (await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "3|1",
      toPath: "t2",
      arrangementLength: "1bar",
    })) as Record<string, unknown>;

    expect(result.detail).toBe(UNNAMED_ENVELOPE_LOSS);
  });

  it("says nothing for a clip with no envelopes", async () => {
    registerWorld(0);

    const result = await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "3|1",
      toPath: "t2",
    });

    expect(result).not.toHaveProperty("detail");
  });

  it("says nothing for a copy on its own track", async () => {
    registerWorld(1);

    const result = await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "3|1",
    });

    expect(result).not.toHaveProperty("detail");
  });
});

describe("ppal-duplicate - a session clip copied to another track's arrangement", () => {
  const LANE_NOTE =
    "wrote its automation to the track's arrangement lane over this span";

  beforeEach(() => {
    vi.clearAllMocks();
    answerEnvelopeList([FREQUENCY_ENVELOPE, PAN_ENVELOPE]);
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: {
        is_midi_clip: 1,
        is_arrangement_clip: 0,
        has_envelopes: 1,
        length: 4,
      },
    });
    registerTrackWithArrangementDup(0);
    registerTrackWithArrangementDup(2, { has_midi_input: 1 });
    registerArrangementClip(0, 0, 8);
    registerArrangementClip(2, 0, 8);
  });

  it("says what Live wrote to the lane, then what it dropped", async () => {
    const result = (await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "3|1",
      toPath: "t2",
    })) as Record<string, unknown>;

    expect(result.detail).toBe(`${LANE_NOTE}; ${NOTE}`);
    expect(requestNode).toHaveBeenCalledTimes(1);
  });

  it("says it on a copy at another length", async () => {
    const result = (await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "3|1",
      toPath: "t2",
      arrangementLength: "2bar",
    })) as Record<string, unknown>;

    expect(String(result.detail)).toContain(NOTE);
  });

  it("says only what Live wrote to the lane for a copy on its own track", async () => {
    const result = (await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "3|1",
    })) as Record<string, unknown>;

    expect(result.detail).toBe(LANE_NOTE);
    expect(requestNode).not.toHaveBeenCalled();
  });
});
