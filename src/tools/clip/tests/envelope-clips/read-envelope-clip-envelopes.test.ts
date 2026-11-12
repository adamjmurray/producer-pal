// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Reading the `envelopes` of a Live 13 return-track envelope clip: the same
// remote-script round trips as a regular clip, addressed `rt<N>`, with the
// parameters named on the return track.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  ENVELOPE_ROUTES,
  type EnvelopeListResult,
} from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import {
  type ReadClipResult,
  readClip,
} from "#src/tools/clip/read/read-clip.ts";
import { RETURN_CLIPS_NEED_LIVE_13 } from "#src/tools/shared/clip/slot-contents/return-track-clips.ts";
import {
  clipSlotReadsOnReturns,
  registerEnvelopeWorld,
} from "./envelope-clip-test-helpers.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

type Listed = EnvelopeListResult["envelopes"][number];

const PARAMETER = {
  min: 0,
  max: 1,
  value: 0.5,
  display: "0.5",
  quantized: false,
  enabled: true,
  automation_state: 1,
};

/** Predelay on the return's Hybrid Reverb: flat, a ramp, flat. */
const PREDELAY: Listed = {
  device: "d0",
  parameter_index: 1,
  parameter: { ...PARAMETER, name: "Predelay" },
  event_count: 4,
};

const RETURN_PAN: Listed = {
  parameter_name: "pan",
  parameter: { ...PARAMETER, name: "Track Pan" },
  event_count: 2,
};

const EVENTS = [
  { time: 0, value: 0.2, display: 0.2, display_str: "20 ms" },
  { time: 1.2, value: 0.2, display: 0.2, display_str: "20 ms" },
  { time: 1.4, value: 0.6, display: 0.6, display_str: "60 ms" },
  { time: 4, value: 0.6, display: 0.6, display_str: "60 ms" },
];

/**
 * Answer the envelope routes: one list, then the same events for every read.
 * @param listed - What the list route reports
 */
function answerRoutes(listed: Listed[]): void {
  vi.mocked(requestNode).mockImplementation(async (route) => ({
    success: true,
    result:
      route === ENVELOPE_ROUTES.list
        ? { available: true, result: { envelopes: listed } }
        : {
            available: true,
            result: {
              exists: true,
              event_count: EVENTS.length,
              events: EVENTS,
            },
          },
  }));
}

/**
 * Read the envelopes of the return clip at a path.
 * @param path - The clip's path
 * @returns What landed on the clip's `envelopes`
 */
async function readEnvelopes(path = "rt1/s0"): Promise<unknown> {
  const clip = (await readClip({
    path,
    include: ["envelopes"],
  })) as ReadClipResult;

  return clip.envelopes;
}

describe("read-clip - envelopes of a return-track envelope clip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    vi.mocked(requestNode).mockReset();
  });

  it("reads the return's own device parameter, named as the return's", async () => {
    registerEnvelopeWorld();
    registerMockObject("predelay-param", {
      path: livePath.returnTrack(1).device(0).parameter(1),
    });
    answerRoutes([PREDELAY]);

    expect(await readEnvelopes()).toStrictEqual([
      {
        parameter: "Predelay",
        id: "predelay-param",
        device: "rt1/d0",
        eventCount: 4,
        events:
          "1|1 0.2 (20 ms) / 1|2.2 0.2 (20 ms) / 1|2.4 0.6 (60 ms) / 2|1 0.6 (60 ms)",
      },
    ]);
  });

  it("addresses every route call to the return track and its slot", async () => {
    registerEnvelopeWorld();
    answerRoutes([PREDELAY]);
    await readEnvelopes();

    expect(requestNode).toHaveBeenCalledWith(
      ENVELOPE_ROUTES.list,
      { track: "rt1", slot: 0 },
      expect.any(Number),
    );
    expect(requestNode).toHaveBeenCalledWith(
      ENVELOPE_ROUTES.read,
      { track: "rt1", slot: 0, device: "d0", parameter: 1, limit: 32 },
      expect.any(Number),
    );
  });

  it("names a mixer parameter by the return track's own mixer", async () => {
    registerEnvelopeWorld();
    registerMockObject("return-pan", {
      path: `${livePath.returnTrack(1).mixerDevice()} panning`,
    });
    answerRoutes([RETURN_PAN]);

    expect(await readEnvelopes()).toStrictEqual([
      expect.objectContaining({ parameter: "Track Pan", id: "return-pan" }),
    ]);
  });

  it("reads a clip with none as an empty set, like a regular clip", async () => {
    registerEnvelopeWorld();
    answerRoutes([]);

    expect(await readEnvelopes("rt0/s0")).toStrictEqual([]);
  });

  it("says when the clip holds envelopes that can't be read", async () => {
    registerEnvelopeWorld();
    answerRoutes([]);

    expect(await readEnvelopes()).toMatch(
      /^the clip has envelopes Producer Pal can't read/,
    );
  });

  it("is told to update when the remote script is too old to reach it", async () => {
    registerEnvelopeWorld();
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: {
        available: false,
        outdated: "the remote script is out of date",
      },
    });

    expect(await readEnvelopes()).toBe("the remote script is out of date");
  });

  it("reads nothing on Live 12, where the path is refused", async () => {
    const world = registerEnvelopeWorld("12.3");

    await expect(readEnvelopes()).rejects.toThrow(RETURN_CLIPS_NEED_LIVE_13);
    expect(requestNode).not.toHaveBeenCalled();
    expect(clipSlotReadsOnReturns(world)).toStrictEqual([]);
  });
});
