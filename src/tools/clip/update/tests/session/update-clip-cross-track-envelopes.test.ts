// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A move to another track says which device envelopes Live's copy dropped.
// Every move path that lands a clip on another track is driven here, so a new
// one can't skip it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  answerEnvelopeList,
  expectOneReadThenHedges,
  FREQUENCY_ENVELOPE,
  VOLUME_ENVELOPE,
} from "#src/tools/clip/tests/envelope-clips/envelope-write-test-helpers.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import {
  type ClipReasons,
  newClipReasons,
} from "#src/tools/clip/update/helpers/entries/clip-reasons.ts";
import { handleArrangementStartOperation } from "#src/tools/clip/update/helpers/arrangement/arrangement-move.ts";
import { newLandingLog } from "#src/tools/shared/clip/landings/landing-log.ts";
import { handleClipSlotMove } from "#src/tools/clip/update/helpers/slot-move/clip-slot-move.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { UNNAMED_ENVELOPE_LOSS } from "#src/tools/clip/envelopes/cross-track-envelopes.ts";
import {
  MOVABLE_CLIP_ID,
  registerMovableClip,
} from "../arrangement/movable-clip-test-helpers.ts";
import { registerMoveToEmptySlot } from "./slot-move-fixtures.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

const NOTE =
  "dropped the device envelopes, which don't copy to another track: Frequency (t0/d1)";

describe("update-clip - a session clip moved to another track", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = setupUpdateClipMocks();
    answerEnvelopeList([FREQUENCY_ENVELOPE, VOLUME_ENVELOPE]);
  });

  /**
   * Make the clip at t0/s0 a MIDI clip, and register its destinations.
   * @param hasEnvelopes - The clip's `has_envelopes` flag
   */
  function registerMove(hasEnvelopes: number): void {
    setupMidiClipMock(mocks.clip123, { has_envelopes: hasEnvelopes });
    registerMoveToEmptySlot();
    registerMockObject("track-0", {
      path: livePath.track(0),
      properties: { has_midi_input: 1, is_frozen: 0 },
    });
    registerMockObject("t0/s3", {
      path: livePath.track(0).clipSlot(3),
      properties: { has_clip: 0 },
    });
    registerMockObject("t0/s3/clip", {
      path: livePath.track(0).clipSlot(3).clip(),
    });
  }

  it("names the device envelopes it dropped, and not the mixer ones", async () => {
    registerMove(1);

    const result = await updateClip({ id: "123", toPath: "t1/s2" });

    expect(result).toStrictEqual({
      id: "t1/s2/clip",
      path: "t1/s2",
      detail: NOTE,
    });
    expect(requestNode).toHaveBeenCalledTimes(1);
    expect(requestNode).toHaveBeenCalledWith(
      ENVELOPE_ROUTES.list,
      { track: "t0", slot: 0 },
      expect.any(Number),
    );
  });

  it("says the overwrite first, then the envelopes, as ppal-duplicate does", async () => {
    registerMove(1);
    registerMockObject("t1/s2", {
      path: livePath.track(1).clipSlot(2),
      properties: { has_clip: 1 },
    });
    registerMockObject("occupant", {
      path: livePath.track(1).clipSlot(2).clip(),
    });
    registerMockObject("t0/s0", {
      path: livePath.track(0).clipSlot(0),
      properties: { has_clip: 1 },
      methods: {
        duplicate_clip_to: () => {
          registerMockObject("moved", {
            path: livePath.track(1).clipSlot(2).clip(),
          });

          return null;
        },
      },
    });

    const result = (await updateClip({ id: "123", toPath: "t1/s2" })) as {
      detail?: string;
    };

    expect(result.detail).toBe(`overwrote the existing clip at t1/s2; ${NOTE}`);
  });

  it("says nothing of envelopes when the move is then refused", async () => {
    registerMove(1);
    // An audio destination can't take a MIDI clip, which is found after the read.
    registerMockObject("track-1", {
      path: livePath.track(1),
      properties: { has_midi_input: 0, is_frozen: 0 },
    });

    await expect(updateClip({ id: "123", toPath: "t1/s2" })).rejects.toThrow(
      /not moved/,
    );
    expect(requestNode).toHaveBeenCalledTimes(1);
  });

  it("hedges when the remote script can't list them", async () => {
    registerMove(1);
    answerEnvelopeList(null);

    const result = (await updateClip({ id: "123", toPath: "t1/s2" })) as {
      detail?: string;
    };

    expect(result.detail).toBe(UNNAMED_ENVELOPE_LOSS);
  });

  it("says nothing, and doesn't ask, for a clip with no envelopes", async () => {
    registerMove(0);

    const result = await updateClip({ id: "123", toPath: "t1/s2" });

    expect(result).not.toHaveProperty("detail");
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("says nothing, and doesn't ask, for a move within its own track", async () => {
    registerMove(1);

    const result = await updateClip({ id: "123", toPath: "t0/s3" });

    expect(result).not.toHaveProperty("detail");
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("hedges on the next clip of a call once a read has stalled", async () => {
    registerMove(1);
    setupMidiClipMock(mocks.clip456, { has_envelopes: 1 });
    registerMockObject("t1/s1", {
      path: livePath.track(1).clipSlot(1),
      properties: { has_clip: 1 },
    });
    registerMockObject("t2/s2", {
      path: livePath.track(2).clipSlot(2),
      properties: { has_clip: 0 },
    });
    registerMockObject("t2/s2/clip", {
      path: livePath.track(2).clipSlot(2).clip(),
    });
    registerMockObject("track-2", {
      path: livePath.track(2),
      properties: { has_midi_input: 1, is_frozen: 0 },
    });

    await expectOneReadThenHedges(() =>
      updateClip({ ids: "123,456", toPath: "t1/s2,t2/s2" }),
    );
  });

  it("keeps the note for the entry when something throws after the copy landed", () => {
    registerMove(1);

    const reasons: ClipReasons = newClipReasons();
    const journal = vi.fn();

    reasons.journal = journal;
    reasons.envelopeLosses.set("123", NOTE);
    handleClipSlotMove({
      clip: LiveAPI.from("id 123"),
      toSlot: { trackIndex: 1, sceneIndex: 2 },
      updatedClips: [],
      noteResult: null,
      reasons,
    });

    expect(journal.mock.calls.map(([phrase]) => phrase)).toStrictEqual([
      "copy at t1/s2",
      NOTE,
    ]);
  });
});

describe("update-clip - an arrangement clip moved to another track", () => {
  const DEST_TRACK = 5;

  beforeEach(() => {
    vi.clearAllMocks();
    answerEnvelopeList([FREQUENCY_ENVELOPE, VOLUME_ENVELOPE]);
  });

  /**
   * A clip on t0 with this `has_envelopes`, and a destination track whose own
   * arrangement duplicate lands the copy.
   * @param hasEnvelopes - The clip's `has_envelopes` flag
   */
  function registerWorld(hasEnvelopes: number): void {
    registerMovableClip(0, { has_envelopes: hasEnvelopes });
    registerTakeLaneTrack({ trackIndex: DEST_TRACK });

    lookupMockObject(
      undefined,
      livePath.track(DEST_TRACK),
    )!.methods.duplicate_clip_to_arrangement = () => {
      registerMockObject("moved-copy", {
        path: livePath.track(DEST_TRACK).arrangementClip(0),
        type: "Clip",
        properties: { start_time: 40, end_time: 48 },
      });

      return ["id", "moved-copy"];
    };
  }

  it("says any device envelopes were dropped, without asking", async () => {
    registerWorld(1);

    const result = (await updateClip({
      id: MOVABLE_CLIP_ID,
      toPath: `t${DEST_TRACK}[6|1]`,
    })) as { detail?: string };

    expect(result.detail).toBe(UNNAMED_ENVELOPE_LOSS);
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("journals the copy before what it dropped", () => {
    registerWorld(1);

    const reasons = newClipReasons();
    const journal = vi.fn();

    reasons.journal = journal;
    handleArrangementStartOperation({
      clip: LiveAPI.from(`id ${MOVABLE_CLIP_ID}`),
      arrangementStartBeats: 40,
      destination: { trackIndex: DEST_TRACK, takeLane: null },
      landings: newLandingLog(),
      isMidiClip: true,
      context: { silenceWavPath: "/tmp/silence.wav" },
      reasons,
    });

    expect(journal.mock.calls.map(([phrase]) => phrase)).toStrictEqual([
      expect.stringMatching(/^copy at /),
      UNNAMED_ENVELOPE_LOSS,
    ]);
  });

  it("says nothing for a clip with no envelopes", async () => {
    registerWorld(0);

    const result = await updateClip({
      id: MOVABLE_CLIP_ID,
      toPath: `t${DEST_TRACK}[6|1]`,
    });

    expect(result).not.toHaveProperty("detail");
  });

  it("leaves a take-lane destination to the re-create's own note", async () => {
    registerWorld(1);

    const result = (await updateClip({
      id: MOVABLE_CLIP_ID,
      toPath: `t${DEST_TRACK}/l0[6|1]`,
    })) as { detail?: string };

    expect(result.detail).toContain("automation envelopes aren't copied");
    expect(result.detail).not.toContain("device envelopes");
  });
});
