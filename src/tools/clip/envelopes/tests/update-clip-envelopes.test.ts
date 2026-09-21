// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// update-clip's `envelopes` param, the one part of a clip write that goes out
// to the Producer Pal remote script.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import {
  setupArrangementMidiClipMock,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

/** A ramp and a jump, in the clip's 4/4. */
const NOTATION = "1|1 0 ~ 3|1 0.8 > 4|1 0.2";

/** The same points, as the write route takes them. */
const POINTS = [
  { time: 0, value: 0 },
  { time: 8, value: 0.8 },
  { time: 12, value: 0.2, jump: true },
];

/** A parameter two racks deep on the clip's own track. */
const FILTER_ID = "472";

/** The clip's track panning, reached by id rather than by name. */
const PAN_ID = "473";

/** A parameter on another track, which the clip can't automate. */
const OTHER_TRACK_ID = "474";

/** A parameter the remote script's device walk has no spelling for. */
const DRUM_PAD_ID = "475";

describe("updateClip - envelopes", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123);
    setupArrangementMidiClipMock(mocks.clip789);

    registerMockObject(FILTER_ID, {
      type: "DeviceParameter",
      path: livePath.track(0).device(0).chain(1).device(0).parameter(2),
    });
    registerMockObject(PAN_ID, {
      type: "DeviceParameter",
      path: `${livePath.track(0).mixerDevice()} panning`,
    });
    registerMockObject(OTHER_TRACK_ID, {
      type: "DeviceParameter",
      path: livePath.track(1).device(0).parameter(0),
    });
    registerMockObject(DRUM_PAD_ID, {
      type: "DeviceParameter",
      path: `${livePath.track(0).device(0).drumPad(3)} chains 0 devices 0 parameters 1`,
    });
    mockNonExistentObjects();
    answerRoutes();
  });

  /**
   * Answer every envelope route the same way.
   * @param reply - What the route answers, in place of a plain success
   */
  function answerRoutes(reply?: unknown): void {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: reply ?? { available: true, result: { cleared: true } },
    });
  }

  /**
   * The args one envelope route was called with.
   * @param route - The route to look for
   * @returns Its args, or undefined when it was never called
   */
  function routeArgs(route: string): unknown {
    return vi
      .mocked(requestNode)
      .mock.calls.find((call) => call[0] === route)?.[1];
  }

  it("writes a device parameter named by id, through its rack chains", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: `${FILTER_ID}: ${NOTATION}`,
    });

    expect(routeArgs(ENVELOPE_ROUTES.write)).toStrictEqual({
      track: "t0",
      slot: 0,
      device: "d0/c1/d0",
      parameter: 2,
      points: POINTS,
    });
    expect(result).toStrictEqual(
      expect.objectContaining({ id: "123", envelopes: 1 }),
    );
  });

  it("writes a mixer parameter by name", async () => {
    await updateClip({ id: "123", envelopes: `volume: ${NOTATION}` });

    expect(routeArgs(ENVELOPE_ROUTES.write)).toStrictEqual({
      track: "t0",
      slot: 0,
      parameter: "volume",
      points: POINTS,
    });
  });

  it("names a mixer parameter reached by id the way the routes do", async () => {
    await updateClip({ id: "123", envelopes: `${PAN_ID}: ${NOTATION}` });

    expect(routeArgs(ENVELOPE_ROUTES.write)).toStrictEqual(
      expect.objectContaining({
        parameter: "pan",
      }),
    );
  });

  it("clears an envelope when the line has nothing after the colon", async () => {
    const result = await updateClip({ id: "123", envelopes: `${FILTER_ID}:` });

    expect(routeArgs(ENVELOPE_ROUTES.clear)).toStrictEqual({
      track: "t0",
      slot: 0,
      device: "d0/c1/d0",
      parameter: 2,
    });
    expect(result).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
  });

  it("refuses a malformed line before it writes anything", async () => {
    await expect(
      updateClip({
        id: "123",
        notes: "C3 1|1",
        envelopes: `volume: ${NOTATION}\n${FILTER_ID}: 1|1 loud`,
      }),
    ).rejects.toThrow('Invalid envelopes line "472: 1|1 loud"');

    expect(requestNode).not.toHaveBeenCalled();
    expect(mocks.clip123.call).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );
  });

  it("refuses a target that names no parameter of the clip's track", async () => {
    await expect(
      updateClip({ id: "123", envelopes: "kick: 1|1 0" }),
    ).rejects.toThrow('Invalid envelopes target "kick"');
  });

  it("refuses two lines for the same parameter", async () => {
    await expect(
      updateClip({ id: "123", envelopes: "volume: 1|1 0\nvolume: 2|1 1" }),
    ).rejects.toThrow('envelopes names "volume" twice');
  });

  it("refuses a blank envelopes param", async () => {
    await expect(updateClip({ id: "123", envelopes: "  " })).rejects.toThrow(
      "envelopes is blank",
    );
  });

  it("sends an arrangement clip to the track's automation lane", async () => {
    const result = await updateClip({
      id: "789",
      envelopes: `volume: ${NOTATION}`,
    });

    expect(requestNode).not.toHaveBeenCalled();
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: expect.stringContaining("automation lane") as string,
      }),
    );
  });

  it("says when the remote script isn't running", async () => {
    answerRoutes({ available: false });

    const result = await updateClip({
      id: "123",
      envelopes: `volume: ${NOTATION}\n${FILTER_ID}: ${NOTATION}`,
    });

    expect(requestNode).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: expect.stringContaining("isn't running") as string,
      }),
    );
  });

  it("reports one line's error and still applies the others", async () => {
    setupMidiClipMock(mocks.clip123, { loop_end: 16, end_marker: 16 });
    vi.mocked(requestNode).mockImplementation(async (_route, args) =>
      (args as { parameter?: unknown }).parameter === "volume"
        ? {
            success: true,
            result: { available: true, error: "value 5 is outside 0..1" },
          }
        : { success: true, result: { available: true, result: {} } },
    );

    const result = await updateClip({
      id: "123",
      envelopes: `volume: ${NOTATION}\n${FILTER_ID}: ${NOTATION}`,
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        reason: 'envelope "volume": value 5 is outside 0..1',
      }),
    );
  });

  it("notes a point past the clip end, which never plays", async () => {
    setupMidiClipMock(mocks.clip123, { loop_end: 8, end_marker: 8 });

    const result = await updateClip({
      id: "123",
      envelopes: `${FILTER_ID}: ${NOTATION}`,
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        reason: `envelope "${FILTER_ID}": point 4|1 is past the clip end (3|1), so it never plays`,
      }),
    );
  });

  it("reports a target on another track on the clip's own entry", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: `${OTHER_TRACK_ID}: ${NOTATION}\nvolume: ${NOTATION}`,
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        reason: expect.stringContaining("is not on the clip's track") as string,
      }),
    );
  });

  it("reports a target inside a drum pad, which the routes can't walk", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: `${DRUM_PAD_ID}: ${NOTATION}`,
    });

    expect(requestNode).not.toHaveBeenCalled();
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        reason: expect.stringContaining("drum pad") as string,
      }),
    );
  });

  it("reports a target that isn't a parameter at all", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: `456: ${NOTATION}`,
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        reason: expect.stringContaining("not a parameter") as string,
      }),
    );
  });

  it("reports a target that names nothing", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: `98765: ${NOTATION}`,
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        reason: 'envelope "98765": no Live object with id 98765',
      }),
    );
  });

  it("writes the envelopes after the notes", async () => {
    const order: string[] = [];
    const notes = mocks.clip123.call.getMockImplementation();

    mocks.clip123.call.mockImplementation(
      (method: string, ...args: unknown[]) => {
        if (method === "add_new_notes") {
          order.push("notes");
        }

        return notes?.(method, ...args);
      },
    );
    vi.mocked(requestNode).mockImplementation(async () => {
      order.push("envelopes");

      return { success: true, result: { available: true, result: {} } };
    });

    await updateClip({
      id: "123",
      notes: "C3 1|1",
      envelopes: `volume: ${NOTATION}`,
    });

    expect(order).toStrictEqual(["notes", "envelopes"]);
  });
});
