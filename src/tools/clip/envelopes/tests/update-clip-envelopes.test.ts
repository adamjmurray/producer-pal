// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip's `envelopes` param, the one part of a clip write that goes out
// to the Producer Pal remote script.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const NOTATION = "1|1 0 / 3|1 0.8 _ 4|1 0.2";

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

/** The clip's track volume, which `volume` also names. */
const VOLUME_ID = "476";

/** The same parameter as VOLUME_ID, spelled with a leading zero. */
const VOLUME_ID_PADDED = "0476";

/** A chain's own mixer parameter, inside a rack on the clip's track. */
const CHAIN_MIXER_ID = "477";

/** The track's Activator, a mixer parameter that isn't volume, pan or a send. */
const ACTIVATOR_ID = "478";

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
    registerMockObject(VOLUME_ID, {
      type: "DeviceParameter",
      path: `${livePath.track(0).mixerDevice()} volume`,
    });
    registerMockObject(VOLUME_ID_PADDED, {
      type: "DeviceParameter",
      path: `${livePath.track(0).mixerDevice()} volume`,
    });
    registerMockObject(CHAIN_MIXER_ID, {
      type: "DeviceParameter",
      path: `${livePath.track(0).device(0).chain(1)} mixer_device volume`,
    });
    registerMockObject(ACTIVATOR_ID, {
      type: "DeviceParameter",
      path: `${livePath.track(0).mixerDevice()} track_activator`,
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

  it("sends a curve as coefficients on the point that starts the segment", async () => {
    await updateClip({
      id: "123",
      envelopes: "volume: 1|1 0 ~0.5 2|1 1 ~-1 3|1 0.5",
    });

    expect(routeArgs(ENVELOPE_ROUTES.write)).toStrictEqual({
      track: "t0",
      slot: 0,
      parameter: "volume",
      points: [
        { time: 0, value: 0, coefficients: [0.125, 0.625, 0.375, 0.875] },
        { time: 4, value: 1, coefficients: [0, 1, 0, 1] },
        { time: 8, value: 0.5 },
      ],
    });
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

  it("refuses a line with no colon between target and notation", async () => {
    await expect(
      updateClip({ id: "123", envelopes: "volume 1|1 0" }),
    ).rejects.toThrow(
      'Invalid envelopes line "volume 1|1 0": expected "<target>: <notation>"',
    );
    expect(requestNode).not.toHaveBeenCalled();
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
        detail: 'envelope "volume": value 5 is outside 0..1',
      }),
    );
  });

  it("words a stalled round trip for the caller, and stops sending", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: false,
      error:
        "node_request 'remoteScript.envelope.write' timed out after 45000ms",
    });

    const result = await updateClip({
      id: "123",
      envelopes: `volume: ${NOTATION}\n${FILTER_ID}: ${NOTATION}\npan: ${NOTATION}`,
    });

    expect(requestNode).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail:
          'envelope "volume": the Producer Pal remote script did not answer in time; its points may still have landed; envelopes not written, since the next would wait the same way: "472", "pan"',
      }),
    );
  });

  it("says a stalled clear may still have happened", async () => {
    vi.mocked(requestNode).mockResolvedValue({ success: false });

    const result = await updateClip({ id: "123", envelopes: "volume:" });

    expect(result).toStrictEqual(
      expect.objectContaining({
        detail:
          'envelope "volume": the Producer Pal remote script did not answer in time; it may still have been cleared',
      }),
    );
  });

  describe("at the request deadline", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("waits no longer than the time left, and sends nothing once it's gone", async () => {
      const deadline = Date.now() + 1000;

      setupMidiClipMock(mocks.clip123, { loop_end: 16, end_marker: 16 });
      vi.mocked(requestNode).mockImplementation(async () => {
        vi.setSystemTime(deadline + 1);

        return { success: true, result: { available: true, result: {} } };
      });

      const result = await updateClip(
        {
          id: "123",
          envelopes: `volume: ${NOTATION}\n${FILTER_ID}: ${NOTATION}\npan: ${NOTATION}`,
        },
        { deadline },
      );

      expect(requestNode).toHaveBeenCalledTimes(1);
      expect(requestNode).toHaveBeenCalledWith(
        ENVELOPE_ROUTES.write,
        expect.anything(),
        1000,
      );
      expect(result).toStrictEqual(
        expect.objectContaining({
          envelopes: 1,
          detail:
            'the request ran out of time; envelopes not written, re-run for "472", "pan"',
        }),
      );
    });
  });

  it("reports a line the clip's own meter can't parse, and writes the rest", async () => {
    setupMidiClipMock(mocks.clip123, {
      signature_numerator: 3,
      signature_denominator: 4,
    });

    const result = await updateClip({
      id: "123",
      envelopes: `volume: 1|5 0 / 2|1 1\npan: 1|1 0 / 2|1 1`,
    });

    expect(requestNode).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual(
      expect.objectContaining({
        id: "123",
        envelopes: 1,
        detail: expect.stringContaining(
          'envelope "volume": Envelope points must run forwards in time',
        ) as string,
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
        detail: `envelope "${FILTER_ID}": point 4|1 is past the clip end (3|1), so it never plays`,
      }),
    );
  });

  describe("when the write re-enables overridden automation", () => {
    const REENABLED =
      'envelope "volume": re-enabled its automation, which was overridden';

    /**
     * Write volume, which the remote script answers as overridden or not.
     * @param reEnabled - Whether the route says it re-enabled the parameter
     * @param notation - The points to write; the default stays inside the clip
     * @returns The clip's result entry
     */
    async function writeVolume(
      reEnabled: boolean,
      notation = "1|1 0.5",
    ): Promise<unknown> {
      answerRoutes({
        available: true,
        result: { samples: [], ...(reEnabled && { re_enabled: true }) },
      });

      return await updateClip({ id: "123", envelopes: `volume: ${notation}` });
    }

    it("says so on the entry", async () => {
      expect(await writeVolume(true)).toStrictEqual(
        expect.objectContaining({ envelopes: 1, detail: REENABLED }),
      );
    });

    it("joins that with a past-the-end note", async () => {
      setupMidiClipMock(mocks.clip123, { loop_end: 8, end_marker: 8 });

      expect(await writeVolume(true, NOTATION)).toStrictEqual(
        expect.objectContaining({
          detail: `${REENABLED}; point 4|1 is past the clip end (3|1), so it never plays`,
        }),
      );
    });

    it("adds no detail when the parameter wasn't overridden", async () => {
      const result = await writeVolume(false);

      expect(result).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
      expect(result).not.toHaveProperty("detail");
    });
  });

  it("reports a target on another track on the clip's own entry", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: `${OTHER_TRACK_ID}: ${NOTATION}\nvolume: ${NOTATION}`,
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        detail: expect.stringContaining("is not on the clip's track") as string,
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
        detail: `envelope "${DRUM_PAD_ID}": id ${DRUM_PAD_ID} is inside a drum pad, which clip automation can't reach`,
      }),
    );
  });

  it("names a chain's own mixer parameter, not a drum pad or return chain", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: `${CHAIN_MIXER_ID}: ${NOTATION}`,
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        detail: `envelope "${CHAIN_MIXER_ID}": id ${CHAIN_MIXER_ID} is a rack chain's own mixer parameter, which clip automation can't reach`,
      }),
    );
  });

  it("names a track mixer parameter that has no mixer name", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: `${ACTIVATOR_ID}: ${NOTATION}`,
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        detail: `envelope "${ACTIVATOR_ID}": id ${ACTIVATOR_ID} is a mixer parameter clip automation can't reach: only the track's volume, pan and sends`,
      }),
    );
  });

  it("names a send reached by id the way the routes do", async () => {
    registerMockObject("480", {
      type: "DeviceParameter",
      path: `${livePath.track(0).mixerDevice()} sends 1`,
    });
    mockNonExistentObjects();

    await updateClip({ id: "123", envelopes: `480: ${NOTATION}` });

    expect(routeArgs(ENVELOPE_ROUTES.write)).toStrictEqual({
      track: "t0",
      slot: 0,
      parameter: "send1",
      points: POINTS,
    });
  });

  it("says a parameter elsewhere on the track can't be reached", async () => {
    registerMockObject("481", {
      type: "DeviceParameter",
      path: `${livePath.track(0)} view selected_parameter`,
    });
    mockNonExistentObjects();

    const result = await updateClip({
      id: "123",
      envelopes: `481: ${NOTATION}`,
    });

    expect(requestNode).not.toHaveBeenCalled();
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail: `envelope "481": id 481 is a parameter clip automation can't reach`,
      }),
    );
  });

  it("names a rack return chain's parameter as one", async () => {
    registerMockObject("479", {
      type: "DeviceParameter",
      path: `${livePath.track(0).device(0).returnChain(0)} devices 0 parameters 1`,
    });
    mockNonExistentObjects();

    const result = await updateClip({
      id: "123",
      envelopes: `479: ${NOTATION}`,
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        detail: expect.stringContaining("rack return chain") as string,
      }),
    );
  });

  it("refuses two lines that reach one parameter by different names", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: `volume: ${NOTATION}\n${VOLUME_ID}: ${NOTATION}`,
    });

    expect(requestNode).not.toHaveBeenCalled();
    expect(result).toStrictEqual(
      expect.objectContaining({
        id: "123",
        envelopes: `not written: "volume" and "${VOLUME_ID}" are the same parameter; give one line per parameter, since each replaces that parameter's whole envelope`,
      }),
    );
  });

  it("refuses two spellings of one id", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: `${VOLUME_ID}: ${NOTATION}\n${VOLUME_ID_PADDED}:`,
    });

    expect(requestNode).not.toHaveBeenCalled();
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: expect.stringContaining("are the same parameter") as string,
      }),
    );
  });

  it("still writes the other lines when a line has no parameter to compare", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: `98765: ${NOTATION}\nvolume: ${NOTATION}\npan: ${NOTATION}`,
    });

    expect(requestNode).toHaveBeenCalledTimes(2);
    expect(result).toStrictEqual(expect.objectContaining({ envelopes: 2 }));
  });

  it("says when a clear found no envelope, and still counts the line", async () => {
    answerRoutes({ available: true, result: { cleared: false } });

    const result = await updateClip({ id: "123", envelopes: "volume:" });

    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        detail: 'envelope "volume": there was no envelope to clear',
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
        detail: expect.stringContaining("not a parameter") as string,
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
        detail: 'envelope "98765": no Live object with id 98765',
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
