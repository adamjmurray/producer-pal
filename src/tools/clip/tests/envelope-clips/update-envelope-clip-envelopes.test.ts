// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip's `envelopes` on a Live 13 return-track envelope clip: the same
// remote-script round trips as a regular clip, addressed `rt<N>`, aimed at the
// return track's own mixer and devices.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  resetWritableEnvelopeWorld,
  type WritableEnvelopeWorld,
} from "./envelope-write-test-helpers.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

type Entry = Record<string, unknown>;

/** A ramp, in the clip's 4/4. */
const NOTATION = "1|1 0 / 1|3 0.8";

/** The same points, as the write route takes them. */
const POINTS = [
  { time: 0, value: 0 },
  { time: 2, value: 0.8 },
];

/**
 * Answer every envelope route the same way.
 * @param reply - What the route answers, in place of a plain success
 */
function answerRoutes(reply?: unknown): void {
  vi.mocked(requestNode).mockReset();
  vi.mocked(requestNode).mockResolvedValue({
    success: true,
    result: reply ?? { available: true, result: {} },
  });
}

/**
 * The args every call to a route carried, less the expiry a change adds.
 * @param route - The route to look for
 * @returns One entry per call
 */
function routeCalls(route: string): unknown[] {
  return vi
    .mocked(requestNode)
    .mock.calls.filter((call) => call[0] === route)
    .map(([, args]) => {
      const { expiresInMs: _expiry, ...rest } = args as Record<string, unknown>;

      return rest;
    });
}

describe("update-clip - envelopes on a return-track envelope clip", () => {
  let world: WritableEnvelopeWorld;

  beforeEach(() => {
    world = resetWritableEnvelopeWorld();
    registerMockObject("471", {
      type: "DeviceParameter",
      path: `${livePath.returnTrack(0).mixerDevice()} panning`,
    });
    registerMockObject("472", {
      type: "DeviceParameter",
      path: livePath.returnTrack(0).device(0).parameter(3),
    });
    registerMockObject("473", {
      type: "DeviceParameter",
      path: livePath.returnTrack(1).device(0).parameter(1),
    });
    registerMockObject("474", {
      type: "DeviceParameter",
      path: `${livePath.track(0).mixerDevice()} volume`,
    });
    answerRoutes();
  });

  it.each([
    ["path", { path: "rt0/s0" }],
    ["id", { ids: "no-envs" }],
  ])("writes a mixer line to a clip named by %s", async (_how, target) => {
    const result = (await updateClip({
      ...target,
      envelopes: `volume: ${NOTATION}`,
    })) as unknown as Entry;

    expect(result).toStrictEqual(
      expect.objectContaining({ id: "no-envs", path: "rt0/s0", envelopes: 1 }),
    );
    expect(routeCalls(ENVELOPE_ROUTES.write)).toStrictEqual([
      { track: "rt0", slot: 0, parameter: "volume", points: POINTS },
    ]);
  });

  it("writes to the return's own device by parameter id", async () => {
    await updateClip({
      path: "rt0/s0",
      envelopes: `472: ${NOTATION}`,
    });

    expect(routeCalls(ENVELOPE_ROUTES.write)).toStrictEqual([
      { track: "rt0", slot: 0, device: "d0", parameter: 3, points: POINTS },
    ]);
  });

  it("writes the return's own pan and send by id and by name", async () => {
    const result = (await updateClip({
      path: "rt0/s0",
      envelopes: [`471: ${NOTATION}`, `send0: ${NOTATION}`].join("\n"),
    })) as unknown as Entry;

    expect(result.envelopes).toBe(2);
    expect(routeCalls(ENVELOPE_ROUTES.write)).toStrictEqual([
      { track: "rt0", slot: 0, parameter: "pan", points: POINTS },
      { track: "rt0", slot: 0, parameter: "send0", points: POINTS },
    ]);
  });

  it("clears an envelope with an empty line", async () => {
    answerRoutes({ available: true, result: { cleared: true } });

    const result = (await updateClip({
      path: "rt1/s0",
      envelopes: "473:",
    })) as unknown as Entry;

    expect(result.envelopes).toBe(1);
    expect(routeCalls(ENVELOPE_ROUTES.clear)).toStrictEqual([
      { track: "rt1", slot: 0, device: "d0", parameter: 1 },
    ]);
    expect(routeCalls(ENVELOPE_ROUTES.write)).toStrictEqual([]);
  });

  it.each([
    ["another return track", "473"],
    ["a regular track", "474"],
  ])("refuses a parameter on %s, sending nothing", async (_where, id) => {
    const result = (await updateClip({
      path: "rt0/s0",
      envelopes: `${id}: ${NOTATION}`,
    })) as unknown as Entry;

    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail: expect.stringContaining(
          `is not on the clip's track (rt0), and a clip can only automate its own track`,
        ) as unknown,
      }),
    );
    expect(requestNode).not.toHaveBeenCalled();
  });

  it.each([
    ["rt1/d0/h56", "is not on the clip's track (rt0)"],
    ["rt0/d0/h56", "is not a hosted plug-in"],
  ])(
    "reads a hosted target %s against the return track",
    async (target, reason) => {
      registerMockObject("rt0-echo", {
        type: "Device",
        path: livePath.returnTrack(0).device(0),
        properties: { name: "Echo", class_name: "Delay" },
      });
      registerMockObject("rt1-reverb", {
        type: "Device",
        path: livePath.returnTrack(1).device(0),
        properties: { name: "Reverb", class_name: "Hybrid" },
      });

      const result = (await updateClip({
        path: "rt0/s0",
        envelopes: `${target}: ${NOTATION}`,
      })) as unknown as Entry;

      expect(result.detail).toContain(reason);
      expect(requestNode).not.toHaveBeenCalled();
    },
  );

  it("reports the lines that landed and the one the remote script turned down", async () => {
    vi.mocked(requestNode).mockReset();
    vi.mocked(requestNode)
      .mockResolvedValueOnce({
        success: true,
        result: { available: true, result: {} },
      })
      .mockResolvedValueOnce({
        success: true,
        result: { available: true, error: "parameter is disabled" },
      });

    const result = (await updateClip({
      path: "rt0/s0",
      envelopes: [`volume: ${NOTATION}`, `pan: ${NOTATION}`].join("\n"),
    })) as unknown as Entry;

    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        detail: 'envelope "pan": parameter is disabled',
      }),
    );
  });

  it("says so when the remote script is too old to reach a return track", async () => {
    answerRoutes({
      available: false,
      outdated: "the remote script is out of date",
    });

    const result = (await updateClip({
      path: "rt0/s0",
      envelopes: `volume: ${NOTATION}`,
    })) as unknown as Entry;

    expect(result.envelopes).toBe("the remote script is out of date");
  });

  it("writes after the rest of the update and still takes the other params", async () => {
    const result = (await updateClip({
      path: "rt0/s0",
      name: "Wide",
      envelopes: `volume: ${NOTATION}`,
    })) as unknown as Entry;

    expect(world.noEnvs.set).toHaveBeenCalledWith("name", "Wide");
    expect(result.envelopes).toBe(1);
    expect(result).not.toHaveProperty("detail");
  });

  it("still ignores convert, and says why", async () => {
    const result = (await updateClip({
      path: "rt0/s0",
      convert: "drums",
      envelopes: `volume: ${NOTATION}`,
    })) as unknown as Entry;

    expect(result.envelopes).toBe(1);
    expect(result.detail).toBe("convert ignored: the clip is an envelope clip");
  });
});
