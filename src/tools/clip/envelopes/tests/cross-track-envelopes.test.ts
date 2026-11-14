// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  answerEnvelopeList,
  FREQUENCY_ENVELOPE,
  MACRO_ENVELOPE,
  VOLUME_ENVELOPE,
} from "#src/tools/clip/tests/envelope-clips/envelope-write-test-helpers.ts";
import {
  READ_DETAIL_MAX_WAIT_MS,
  WRITE_AFTER_READ_RESERVE_MS,
} from "#src/tools/shared/remote-script/remote-script-wait.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import {
  type EnvelopeLossContext,
  arrangementEnvelopeLoss,
  crossTrackEnvelopeLoss,
  droppedEnvelopes,
  leavesTrack,
  UNNAMED_ENVELOPE_LOSS,
} from "../cross-track-envelopes.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

/** A fresh call's context, as every call has its own memory of stalled reads. */
let CONTEXT: EnvelopeLossContext;

const DROPPED =
  "dropped the device envelopes, which don't copy to another track";

/**
 * A session clip on a regular track.
 * @param hasEnvelopes - The `has_envelopes` flag
 * @returns The clip
 */
function sessionClip(hasEnvelopes = 1): LiveAPI {
  registerMockObject("session", {
    path: livePath.track(0).clipSlot(2).clip(),
    properties: { is_arrangement_clip: 0, has_envelopes: hasEnvelopes },
  });

  return LiveAPI.from("id session");
}

/**
 * A Live 13 return track clip.
 * @returns The clip
 */
function returnClip(): LiveAPI {
  registerMockObject("on-return", {
    path: livePath.returnTrack(1).clipSlot(0).clip(),
    properties: { is_arrangement_clip: 0, has_envelopes: 1 },
  });

  return LiveAPI.from("id on-return");
}

/**
 * An arrangement clip on track 0.
 * @param hasEnvelopes - The `has_envelopes` flag
 * @returns The clip
 */
function arrangementClip(hasEnvelopes = 1): LiveAPI {
  registerMockObject("arrangement", {
    path: livePath.track(0).arrangementClip(0),
    properties: { is_arrangement_clip: 1, has_envelopes: hasEnvelopes },
  });

  return LiveAPI.from("id arrangement");
}

describe("cross-track envelope loss", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requestNode).mockReset();
    clearMockRegistry();
    CONTEXT = { deadline: null, manage: true, reads: { stalled: false } };
  });

  describe("a session clip copied to another track", () => {
    it("names each device envelope with its source device, and not the mixer ones", async () => {
      answerEnvelopeList([FREQUENCY_ENVELOPE, VOLUME_ENVELOPE, MACRO_ENVELOPE]);

      const note = await crossTrackEnvelopeLoss(
        sessionClip(),
        { kind: "regular", index: 1 },
        CONTEXT,
      );

      expect(note).toBe(`${DROPPED}: Frequency (t0/d1), Macro 1 (t0/d0)`);
      expect(requestNode).toHaveBeenCalledWith(
        ENVELOPE_ROUTES.list,
        { track: "t0", slot: 2 },
        expect.any(Number),
      );
    });

    // The rack isn't on the other track, so its chains' mixers aren't either.
    it("names an envelope on a rack chain's own mixer", async () => {
      answerEnvelopeList([
        VOLUME_ENVELOPE,
        { ...VOLUME_ENVELOPE, device: "d0/c1" },
      ]);

      expect(
        await crossTrackEnvelopeLoss(
          sessionClip(),
          { kind: "regular", index: 1 },
          CONTEXT,
        ),
      ).toBe(`${DROPPED}: ${VOLUME_ENVELOPE.parameter.name} (t0/d0/c1)`);
    });

    it("says nothing when only mixer envelopes were on the clip", async () => {
      answerEnvelopeList([VOLUME_ENVELOPE]);

      expect(
        await crossTrackEnvelopeLoss(
          sessionClip(),
          { kind: "regular", index: 1 },
          CONTEXT,
        ),
      ).toBeNull();
    });

    it("hedges when the remote script can't list them", async () => {
      answerEnvelopeList(null);

      expect(
        await crossTrackEnvelopeLoss(
          sessionClip(),
          { kind: "regular", index: 1 },
          CONTEXT,
        ),
      ).toBe(UNNAMED_ENVELOPE_LOSS);
    });

    it("doesn't ask when the clip has no envelopes", async () => {
      expect(
        await crossTrackEnvelopeLoss(
          sessionClip(0),
          { kind: "regular", index: 1 },
          CONTEXT,
        ),
      ).toBeNull();
      expect(requestNode).not.toHaveBeenCalled();
    });
  });

  describe("the same track", () => {
    it("says nothing and doesn't ask, whatever slot it lands in", async () => {
      expect(
        await crossTrackEnvelopeLoss(
          sessionClip(),
          { kind: "regular", index: 0 },
          CONTEXT,
        ),
      ).toBeNull();
      expect(requestNode).not.toHaveBeenCalled();
    });

    it("counts a regular track and a return track of the same index as different", () => {
      expect(leavesTrack(sessionClip(), { kind: "return", index: 0 })).toBe(
        true,
      );
    });
  });

  describe("a return track clip", () => {
    it.each([
      ["another return track", { kind: "return", index: 0 }],
      ["a regular track", { kind: "regular", index: 1 }],
    ] as const)("names its device envelopes going to %s", async (_to, to) => {
      answerEnvelopeList([MACRO_ENVELOPE]);

      const note = await crossTrackEnvelopeLoss(returnClip(), to, CONTEXT);

      expect(note).toBe(`${DROPPED}: Macro 1 (rt1/d0)`);
      expect(requestNode).toHaveBeenCalledWith(
        ENVELOPE_ROUTES.list,
        { track: "rt1", slot: 0 },
        expect.any(Number),
      );
    });

    it("says nothing going to a slot of its own return track", async () => {
      expect(
        await crossTrackEnvelopeLoss(
          returnClip(),
          { kind: "return", index: 1 },
          CONTEXT,
        ),
      ).toBeNull();
    });
  });

  describe("an arrangement clip", () => {
    it("is hedged, without asking, when it has envelopes and changes track", async () => {
      expect(
        await crossTrackEnvelopeLoss(
          arrangementClip(),
          { kind: "regular", index: 3 },
          CONTEXT,
        ),
      ).toBe(UNNAMED_ENVELOPE_LOSS);
      expect(arrangementEnvelopeLoss(arrangementClip(), 3)).toBe(
        UNNAMED_ENVELOPE_LOSS,
      );
      expect(requestNode).not.toHaveBeenCalled();
    });

    it("says nothing without envelopes, or on its own track", () => {
      expect(arrangementEnvelopeLoss(arrangementClip(0), 3)).toBeNull();
      expect(arrangementEnvelopeLoss(arrangementClip(1), 0)).toBeNull();
    });

    it("leaves a session clip to the lane note, which names it", () => {
      expect(arrangementEnvelopeLoss(sessionClip(), 3)).toBeNull();
    });
  });

  describe("a read that can't be answered", () => {
    it("waits only as long as a detail read does", async () => {
      answerEnvelopeList([FREQUENCY_ENVELOPE]);

      await droppedEnvelopes(sessionClip(), CONTEXT);

      expect(requestNode).toHaveBeenCalledWith(
        ENVELOPE_ROUTES.list,
        expect.anything(),
        READ_DETAIL_MAX_WAIT_MS,
      );
    });

    it("gives up early, without asking, when too little time is left for the copy", async () => {
      CONTEXT.deadline = Date.now() + WRITE_AFTER_READ_RESERVE_MS - 1000;

      expect(await droppedEnvelopes(sessionClip(), CONTEXT)).toBe(
        UNNAMED_ENVELOPE_LOSS,
      );
      expect(requestNode).not.toHaveBeenCalled();
      expect(CONTEXT.reads.stalled).toBe(true);
    });

    it("waits no longer than what is left once the copy's time is kept back", async () => {
      answerEnvelopeList([FREQUENCY_ENVELOPE]);
      CONTEXT.deadline = Date.now() + WRITE_AFTER_READ_RESERVE_MS + 500;

      await droppedEnvelopes(sessionClip(), CONTEXT);

      expect(vi.mocked(requestNode).mock.calls[0]?.[2]).toBeLessThanOrEqual(
        500,
      );
    });

    it("sends the next clip of the call straight to the hedge", async () => {
      answerEnvelopeList(null);

      expect(await droppedEnvelopes(sessionClip(), CONTEXT)).toBe(
        UNNAMED_ENVELOPE_LOSS,
      );
      expect(CONTEXT.reads.stalled).toBe(true);

      expect(await droppedEnvelopes(sessionClip(), CONTEXT)).toBe(
        UNNAMED_ENVELOPE_LOSS,
      );
      expect(requestNode).toHaveBeenCalledTimes(1);
    });

    it("stalls on a route that never answered, not on one that answered with an error", async () => {
      vi.mocked(requestNode).mockResolvedValue({ success: false });

      await droppedEnvelopes(sessionClip(), CONTEXT);

      expect(CONTEXT.reads.stalled).toBe(true);

      CONTEXT.reads.stalled = false;
      vi.mocked(requestNode).mockResolvedValue({
        success: true,
        result: { available: true, error: "no such clip" },
      });

      expect(await droppedEnvelopes(sessionClip(), CONTEXT)).toBe(
        UNNAMED_ENVELOPE_LOSS,
      );
      expect(CONTEXT.reads.stalled).toBe(false);
    });

    it("hedges, and doesn't throw, when naming the envelopes fails", async () => {
      vi.mocked(requestNode).mockRejectedValue(new Error("Max went away"));

      expect(await droppedEnvelopes(sessionClip(), CONTEXT)).toBe(
        UNNAMED_ENVELOPE_LOSS,
      );
    });
  });

  it("names what a clip drops whatever the destination, for a caller that repeats it", async () => {
    answerEnvelopeList([FREQUENCY_ENVELOPE]);

    expect(await droppedEnvelopes(sessionClip(), CONTEXT)).toBe(
      `${DROPPED}: Frequency (t0/d1)`,
    );
  });
});
