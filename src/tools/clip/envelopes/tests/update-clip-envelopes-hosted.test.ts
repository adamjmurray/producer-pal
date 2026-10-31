// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip's `envelopes` for a hosted plug-in's param, which is automated
// through one of its wrapper's slots: choosing the slot, mapping it, and what
// the clip's entry says about it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  infoReply,
  installWrapper,
} from "#src/tools/device/tests/helpers/plugin-host-wrapper-fixtures.ts";
import {
  answerAsWrapper,
  FULL_BANK,
  answerRoutes,
  heardOp,
  routeArgs,
  setupTrack,
} from "./hosted-envelope-test-helpers.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

/** One point, in the clip's 4/4. */
const NOTATION = "1|1 0.2";

/**
 * Write a point to hosted params.
 * @param targets - The targets to write, in order
 * @returns The clip's entry
 */
function write(...targets: string[]) {
  return updateClip({
    id: "123",
    envelopes: targets.map((target) => `${target}: ${NOTATION}`).join("\n"),
  });
}

/** The reason a param gets when every slot is in use. */
const BANK_FULL =
  'envelope "t0/d0/h206": all 4 automation slots of t0/d0 are in use';

describe("updateClip - envelopes on a hosted plug-in's param", () => {
  beforeEach(() => {
    clearMockRegistry();
    setupMidiClipMock(setupUpdateClipMocks().clip123);
    answerRoutes();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("writes to the slot already on the param, mapping nothing", async () => {
    setupTrack();

    const wrapper = answerAsWrapper([
      { slot: 2, index: 206, name: "Main Vol" },
    ]);
    const result = await write("t0/d0/h206");

    expect(heardOp(wrapper, "map")).toStrictEqual([]);
    expect(routeArgs(ENVELOPE_ROUTES.write)).toStrictEqual(
      expect.objectContaining({ device: "d0", parameter: 2 }),
    );
    expect(result).toStrictEqual(
      expect.objectContaining({ id: "123", envelopes: 1 }),
    );
    expect(result).not.toHaveProperty("detail");
  });

  it("maps the lowest free slot to a param with none, and says so", async () => {
    setupTrack();

    const wrapper = answerAsWrapper([{ slot: 1, index: 5, name: "Cutoff" }]);
    const result = await write("t0/d0/h206");

    expect(heardOp(wrapper, "map")).toStrictEqual([
      { deviceId: "device-123", op: "map", slot: 2, index: 206 },
    ]);
    expect(routeArgs(ENVELOPE_ROUTES.write)).toStrictEqual(
      expect.objectContaining({ device: "d0", parameter: 2 }),
    );
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        detail: 'envelope "t0/d0/h206": mapped to slot "Automation 002"',
      }),
    );
  });

  it("asks the wrapper once, and gives each new param the next slot", async () => {
    setupTrack();

    const wrapper = answerAsWrapper();
    const result = await write("t0/d0/h206", "t0/d0/h9");

    expect(heardOp(wrapper, "slots")).toHaveLength(1);
    expect(heardOp(wrapper, "map").map((m) => [m.slot, m.index])).toStrictEqual(
      [
        [1, 206],
        [2, 9],
      ],
    );
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 2,
        detail:
          'envelope "t0/d0/h206": mapped to slot "Automation 001"; ' +
          'envelope "t0/d0/h9": mapped to slot "Automation 002"',
      }),
    );
  });

  it.each([
    ["holds arrangement automation", { automation: [1] }],
    ["has no parameter on the wrapper", { skipSlots: [1] }],
  ])("passes over a free slot that %s", async (_why, track) => {
    setupTrack(track);

    const wrapper = answerAsWrapper();

    await write("t0/d0/h206");

    expect(heardOp(wrapper, "map")[0]).toStrictEqual(
      expect.objectContaining({ slot: 2 }),
    );
  });

  it("takes over the lowest slot whose automation is gone everywhere", async () => {
    setupTrack({ automation: [0, 0, 1, 1] });

    // Slot 1's param has an envelope in a clip; slot 2's has nothing. Other
    // devices' envelopes and the mixer's don't count.
    answerRoutes([{ device: "d0", index: 1 }, { device: "d3", index: 2 }, {}]);

    const wrapper = answerAsWrapper(FULL_BANK);
    const result = await write("t0/d0/h206");

    expect(heardOp(wrapper, "map")[0]).toStrictEqual(
      expect.objectContaining({ slot: 2, index: 206 }),
    );
    expect(routeArgs(ENVELOPE_ROUTES.list)).toStrictEqual({
      track: "t0",
      slot: 0,
    });
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        detail:
          'envelope "t0/d0/h206": mapped to slot "Automation 002" ' +
          '(it drove "Res", which had no automation left)',
      }),
    );
  });

  it("lists the clips' envelopes once for all the slots it takes over", async () => {
    setupTrack();

    const wrapper = answerAsWrapper(FULL_BANK);

    await write("t0/d0/h206", "t0/d0/h207");

    expect(heardOp(wrapper, "map").map((m) => m.slot)).toStrictEqual([1, 2]);
    expect(
      vi
        .mocked(requestNode)
        .mock.calls.filter((call) => call[0] === ENVELOPE_ROUTES.list),
    ).toHaveLength(1);
  });

  it("never takes over a slot an earlier line of the call chose", async () => {
    setupTrack({ automation: [0, 1] });

    const wrapper = answerAsWrapper(FULL_BANK);

    await write("t0/d0/h5", "t0/d0/h206");

    // h5 sits on slot 1, so it is not taken over for h206.
    expect(heardOp(wrapper, "map")[0]).toStrictEqual(
      expect.objectContaining({ slot: 3 }),
    );
  });

  it.each([
    [
      "every slot has arrangement automation",
      () => setupTrack({ automation: [1, 1, 1, 1] }),
      `${BANK_FULL}. Delete the automation of one (a clip's envelope or the arrangement lane; ppal-read-device shows which params have a slot) to free it`,
    ],
    [
      "clips still hold an envelope on every slot",
      () => {
        setupTrack();
        answerRoutes([1, 2, 3, 4].map((index) => ({ device: "d0", index })));
      },
      expect.stringContaining(BANK_FULL),
    ],
    [
      "the track plays from Session",
      () => setupTrack({ playingSlot: 0 }),
      `${BANK_FULL}, and which have automation can't be told while the track plays from Session; stop its session clips and try again`,
    ],
    [
      "the clips' envelopes can't be listed",
      () => {
        setupTrack();
        vi.mocked(requestNode).mockReset();
        vi.mocked(requestNode).mockResolvedValue({
          success: true,
          result: { available: false },
        });
      },
      expect.stringContaining(BANK_FULL),
    ],
  ])(
    "skips a param with no slot to take when %s",
    async (_why, setup, detail) => {
      setup();

      const wrapper = answerAsWrapper(FULL_BANK);
      const result = await write("t0/d0/h206");

      expect(heardOp(wrapper, "map")).toStrictEqual([]);
      expect(routeArgs(ENVELOPE_ROUTES.write)).toBeUndefined();
      expect(result).toStrictEqual(
        expect.objectContaining({ envelopes: 0, detail }),
      );
    },
  );

  it.each([
    [
      "the device is still loading",
      "the device is still loading; try again in a moment",
    ],
    ["no such parameter", "couldn't map an automation slot: no such parameter"],
  ])(
    "skips the line, mapping nothing, when the wrapper says %s",
    async (error, why) => {
      setupTrack();

      answerAsWrapper().mapError = error;

      const result = await write("t0/d0/h206");

      expect(routeArgs(ENVELOPE_ROUTES.write)).toBeUndefined();
      expect(result).toStrictEqual(
        expect.objectContaining({
          envelopes: 0,
          detail: `envelope "t0/d0/h206": ${why}`,
        }),
      );
    },
  );

  it("still says it mapped a slot when the write then fails", async () => {
    setupTrack();
    answerAsWrapper();
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: true, error: "Live said no" },
    });

    expect(await write("t0/d0/h206")).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail: expect.stringMatching(
          /^envelope "t0\/d0\/h206": .*Live said no.*; already changed: mapped to slot "Automation 001"$/,
        ),
      }),
    );
  });

  it("skips a mapped slot the wrapper lists no parameter for", async () => {
    setupTrack({ skipSlots: [2] });
    answerAsWrapper([{ slot: 2, index: 206, name: "Main Vol" }]);

    expect(await write("t0/d0/h206")).toStrictEqual(
      expect.objectContaining({
        detail:
          'envelope "t0/d0/h206": t0/d0 has no parameter named "Automation 002"',
      }),
    );
  });

  it.each([
    [
      "whose slots can't be read",
      { slots: () => ({ success: false, error: "unknown op slots" }) },
      "this wrapper is out of date; create the hosted plug-in again",
    ],
    ["that doesn't answer", {}, "the hosted plug-in didn't answer"],
  ])("skips a wrapper %s", async (_why, replies, detail) => {
    setupTrack();
    installWrapper({ info: () => infoReply("Serum 2"), ...replies });

    expect(await write("t0/d0/h206")).toStrictEqual(
      expect.objectContaining({ detail: `envelope "t0/d0/h206": ${detail}` }),
    );
  });
});

describe("updateClip - hosted envelope targets", () => {
  beforeEach(() => {
    clearMockRegistry();
    setupMidiClipMock(setupUpdateClipMocks().clip123);
    answerRoutes();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skips a device on another track, since a clip can only automate its own", async () => {
    setupTrack();
    answerAsWrapper();

    const result = await write("t1/d0/h206");

    expect(requestNode).not.toHaveBeenCalled();
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail: expect.stringContaining('envelope "t1/d0/h206": nothing at'),
      }),
    );
  });

  it("skips a device that isn't a plug-in host wrapper", async () => {
    setupTrack();
    installWrapper({});

    const result = await write("t0/d0/h206");

    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail: 'envelope "t0/d0/h206": t0/d0 is not a hosted plug-in',
      }),
    );
  });

  it("skips a path that names no device", async () => {
    setupTrack();
    answerAsWrapper();

    const result = await write("t0/d3/h206");

    expect(result).toStrictEqual(
      expect.objectContaining({
        detail: expect.stringContaining('envelope "t0/d3/h206": nothing at'),
      }),
    );
  });

  it("skips a chain, which is no device", async () => {
    setupTrack({ nested: true });
    answerAsWrapper();

    expect(await write("t0/d0/c1/h206")).toStrictEqual(
      expect.objectContaining({
        detail: 'envelope "t0/d0/c1/h206": t0/d0/c1 is not a device',
      }),
    );
  });

  it("skips a device on a return track, which isn't the clip's", async () => {
    setupTrack();
    registerMockObject("return-device", {
      path: String(livePath.returnTrack(0).device(0)),
    });
    answerAsWrapper();

    expect(await write("rt0/d0/h206")).toStrictEqual(
      expect.objectContaining({
        detail: expect.stringContaining(
          "rt0/d0 is not on the clip's track (t0)",
        ),
      }),
    );
  });

  it("skips a device in a rack's return chain, which clip automation can't reach", async () => {
    setupTrack();
    registerMockObject("return-chain-device", {
      path: `${livePath.track(0).device(0)} return_chains 0 devices 0`,
    });
    answerAsWrapper();

    expect(await write("t0/d0/rc0/d0/h206")).toStrictEqual(
      expect.objectContaining({
        detail:
          'envelope "t0/d0/rc0/d0/h206": t0/d0/rc0/d0 sits somewhere clip automation can\'t reach',
      }),
    );
  });

  it("skips a path that names a chain, not a device", async () => {
    setupTrack();
    answerAsWrapper();

    const result = await write("t0/d0/c0/h206");

    expect(result).toStrictEqual(
      expect.objectContaining({
        detail: expect.stringContaining('envelope "t0/d0/c0/h206": '),
      }),
    );
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("skips a device inside a drum pad, which clip automation can't reach", async () => {
    setupTrack();
    answerAsWrapper();

    const result = await write("t0/d0/pC1/d0/h206");

    expect(result).toStrictEqual(
      expect.objectContaining({
        detail:
          'envelope "t0/d0/pC1/d0/h206": t0/d0/pC1/d0 is inside a drum pad, which clip automation can\'t reach',
      }),
    );
  });

  it("skips h0, which is no plug-in param's id", async () => {
    setupTrack();
    answerAsWrapper();

    const result = await write("t0/d0/h0");

    expect(result).toStrictEqual(
      expect.objectContaining({
        detail:
          'envelope "t0/d0/h0": h0 is not a hosted plug-in\'s param id (they look like h56)',
      }),
    );
  });

  it("refuses a target that isn't an h id at all, before anything is written", async () => {
    setupTrack();

    await expect(
      updateClip({ id: "123", envelopes: `t0/d0/hx: ${NOTATION}` }),
    ).rejects.toThrow(
      "expected a parameter id, or volume, pan, send0.., or a hosted plug-in's param like t0/d0/h56",
    );
  });

  it("refuses two lines that name one param by different spellings", async () => {
    setupTrack();

    const wrapper = answerAsWrapper();
    const result = await updateClip({
      id: "123",
      envelopes: `t0/d0/h206: ${NOTATION}\nt0/d0/H206: ${NOTATION}`,
    });

    expect(heardOp(wrapper, "map")).toStrictEqual([]);
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: expect.stringContaining(
          '"t0/d0/h206" and "t0/d0/H206" are the same parameter',
        ),
      }),
    );
  });

  it("knows no hosted spelling in a build without hosted plug-ins", async () => {
    vi.stubEnv("ENABLE_HOSTED_PLUGINS", "");
    setupTrack();

    await expect(
      updateClip({ id: "123", envelopes: `t0/d0/h206: ${NOTATION}` }),
    ).rejects.toThrow(
      'Invalid envelopes target "t0/d0/h206" in "t0/d0/h206: 1|1 0.2": expected a parameter id, or volume, pan, send0..',
    );
  });

  it("clears the envelope on the slot that drives the param", async () => {
    setupTrack();
    answerAsWrapper([{ slot: 3, index: 206, name: "Main Vol" }]);

    const result = await updateClip({ id: "123", envelopes: "t0/d0/h206:" });

    expect(routeArgs(ENVELOPE_ROUTES.clear)).toStrictEqual({
      track: "t0",
      slot: 0,
      device: "d0",
      parameter: 3,
    });
    expect(result).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
  });

  it("clears nothing for a param no slot drives, which is no error", async () => {
    setupTrack();

    const wrapper = answerAsWrapper([{ slot: 3, index: 5, name: "Cutoff" }]);
    const result = await updateClip({ id: "123", envelopes: "t0/d0/h206:" });

    expect(requestNode).not.toHaveBeenCalled();
    expect(heardOp(wrapper, "map")).toStrictEqual([]);
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        detail: 'envelope "t0/d0/h206": there was no envelope to clear',
      }),
    );
  });

  it("reaches a wrapper inside a rack's chain by the remote script's walk", async () => {
    setupTrack({ nested: true });
    answerAsWrapper([{ slot: 1, index: 206, name: "Main Vol" }]);

    await write("t0/d0/c1/d0/h206");

    expect(routeArgs(ENVELOPE_ROUTES.write)).toStrictEqual(
      expect.objectContaining({ device: "d0/c1/d0", parameter: 1 }),
    );
  });

  it("finds a wrapper's device by its type, as a device path does", async () => {
    setupTrack();
    answerAsWrapper([{ slot: 1, index: 206, name: "Main Vol" }]);

    await write("t0/afx0/h206");

    expect(routeArgs(ENVELOPE_ROUTES.write)).toStrictEqual(
      expect.objectContaining({ device: "d0", parameter: 1 }),
    );
  });
});
