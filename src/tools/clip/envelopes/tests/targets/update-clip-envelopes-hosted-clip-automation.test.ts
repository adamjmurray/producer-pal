// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip's `envelopes` for a hosted plug-in's param: a free slot is one
// no clip on the track holds an envelope for either, since mapping it would
// hand that envelope to the new param.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import { useFakeDate } from "#src/tools/clip/envelopes/tests/envelope-route-test-helpers.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  answerAsWrapper,
  answerRoutes,
  FULL_BANK,
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
 * @param context - The call's context
 * @returns The clip's entry
 */
function write(targets: string[], context: { deadline?: number } = {}) {
  return updateClip(
    {
      id: "123",
      envelopes: targets.map((target) => `${target}: ${NOTATION}`).join("\n"),
    },
    context,
  );
}

/**
 * @returns How many times the clips' envelopes were listed
 */
function listCalls(): number {
  return vi
    .mocked(requestNode)
    .mock.calls.filter((call) => call[0] === ENVELOPE_ROUTES.list).length;
}

/**
 * Envelopes held by the wrapper's slot parameters: the wrapper's parameter 0 is
 * its Device On, so slot n is parameter n.
 * @param slots - The slots the clip holds an envelope for
 * @returns The clip's envelopes
 */
function onSlots(...slots: number[]) {
  return slots.map((index) => ({ device: "d0", index }));
}

describe("updateClip - a hosted param's free slot and clip envelopes", () => {
  beforeEach(() => {
    clearMockRegistry();
    setupMidiClipMock(setupUpdateClipMocks().clip123);
    answerRoutes();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes over an unmapped slot a clip holds an envelope for", async () => {
    setupTrack();
    answerRoutes(onSlots(1));

    const wrapper = answerAsWrapper();
    const result = await write(["t0/d0/h206"]);

    expect(heardOp(wrapper, "map")).toStrictEqual([
      { deviceId: "device-123", op: "map", slot: 2, index: 206 },
    ]);
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        detail: 'envelope "t0/d0/h206": mapped to slot "Automation 002"',
      }),
    );
  });

  it("lists the clips once however many params need a slot", async () => {
    setupTrack();
    answerRoutes(onSlots(1));

    const wrapper = answerAsWrapper();

    await write(["t0/d0/h206", "t0/d0/h9"]);

    expect(heardOp(wrapper, "map").map((m) => m.slot)).toStrictEqual([2, 3]);
    expect(listCalls()).toBe(1);
  });

  it("doesn't list the clips for a param that already has a slot", async () => {
    setupTrack();
    answerAsWrapper([{ slot: 2, index: 206, name: "Main Vol" }]);

    await write(["t0/d0/h206"]);

    expect(listCalls()).toBe(0);
  });

  it("takes over a mapped slot when every free one holds a clip's envelope", async () => {
    setupTrack();
    // Slot 1 is mapped and has no envelope; slots 2 to 4 are unmapped and do.
    answerRoutes(onSlots(2, 3, 4));

    const wrapper = answerAsWrapper([{ slot: 1, index: 5, name: "Cutoff" }]);
    const result = await write(["t0/d0/h206"]);

    expect(heardOp(wrapper, "map")[0]).toStrictEqual(
      expect.objectContaining({ slot: 1, index: 206 }),
    );
    expect(result).toStrictEqual(
      expect.objectContaining({
        detail:
          'envelope "t0/d0/h206": mapped to slot "Automation 001" ' +
          '(it drove "Cutoff", which had no automation left)',
      }),
    );
  });

  it("skips the param when every slot holds a clip's envelope", async () => {
    setupTrack();
    answerRoutes(onSlots(1, 2, 3, 4));

    const wrapper = answerAsWrapper([{ slot: 1, index: 5, name: "Cutoff" }]);
    const result = await write(["t0/d0/h206"]);

    expect(heardOp(wrapper, "map")).toStrictEqual([]);
    expect(routeArgs(ENVELOPE_ROUTES.write)).toBeUndefined();
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail: expect.stringContaining(
          'envelope "t0/d0/h206": all 4 automation slots of t0/d0 are in use',
        ),
      }),
    );
  });

  it("still maps a free slot on a track that plays from Session", async () => {
    // Every slot reads as having no lane automation there, whatever it holds.
    setupTrack({ playingSlot: 0 });

    const wrapper = answerAsWrapper();

    await write(["t0/d0/h206"]);

    expect(heardOp(wrapper, "map")[0]).toStrictEqual(
      expect.objectContaining({ slot: 1 }),
    );
  });

  it("checks clips for a free slot on a track that plays from Session too", async () => {
    setupTrack({ playingSlot: 0 });
    answerRoutes(onSlots(1, 2));

    const wrapper = answerAsWrapper();

    await write(["t0/d0/h206"]);

    expect(heardOp(wrapper, "map")[0]).toStrictEqual(
      expect.objectContaining({ slot: 3 }),
    );
  });

  it("asks nothing of the clips when no slot is free anyway", async () => {
    setupTrack({ automation: [1, 1, 1, 1] });
    answerAsWrapper();

    await write(["t0/d0/h206"]);

    expect(listCalls()).toBe(0);
  });
});

describe("updateClip - a hosted param's slot when the clips can't be checked", () => {
  beforeEach(() => {
    clearMockRegistry();
    setupMidiClipMock(setupUpdateClipMocks().clip123);
    answerRoutes();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses the line, mapping nothing, when the remote script doesn't answer", async () => {
    setupTrack();

    const wrapper = answerAsWrapper();

    vi.mocked(requestNode).mockResolvedValue({ success: false });

    expect(await write(["t0/d0/h206"])).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail:
          "envelope \"t0/d0/h206\": no slot mapped, since the track's clips couldn't be checked for automation: the Producer Pal remote script did not answer in time",
      }),
    );
    expect(heardOp(wrapper, "map")).toStrictEqual([]);
  });

  it("still writes the lines that need no lookup, and asks only once", async () => {
    setupTrack();
    answerRoutes();

    const wrapper = answerAsWrapper([
      { slot: 2, index: 206, name: "Main Vol" },
    ]);

    vi.mocked(requestNode).mockImplementation(async (route) =>
      route === ENVELOPE_ROUTES.list
        ? { success: false }
        : { success: true, result: { available: true, result: {} } },
    );

    const result = await write(["t0/d0/h9", "t0/d0/h206", "t0/d0/h10"]);

    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        detail: expect.stringMatching(
          /^envelope "t0\/d0\/h9": no slot mapped.*; envelope "t0\/d0\/h10": no slot mapped/,
        ),
      }),
    );
    expect(listCalls()).toBe(1);
    expect(heardOp(wrapper, "map")).toStrictEqual([]);
  });

  it("says the remote script is missing, as every other write does", async () => {
    setupTrack();
    answerRoutes();

    const wrapper = answerAsWrapper();

    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: false },
    });

    expect(await write(["t0/d0/h206"])).toStrictEqual(
      expect.objectContaining({
        envelopes: expect.stringContaining("remote script isn't running"),
      }),
    );
    expect(heardOp(wrapper, "map")).toStrictEqual([]);
  });

  it("keeps what earlier lines changed when the lookup then throws", async () => {
    setupTrack();
    answerRoutes();

    answerAsWrapper([{ slot: 2, index: 206, name: "Main Vol" }]);
    vi.mocked(requestNode).mockImplementation(async (route) => {
      if (route === ENVELOPE_ROUTES.list) {
        throw new Error("socket closed");
      }

      return { success: true, result: { available: true, result: {} } };
    });

    expect(await write(["t0/d0/h206", "t0/d0/h9"])).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        detail: 'envelope "t0/d0/h9": socket closed',
      }),
    );
  });

  it("keeps the slot an earlier line mapped when a later line throws", async () => {
    setupTrack();

    const wrapper = answerAsWrapper();
    const heard = vi.mocked(globalThis.messnamed).getMockImplementation();

    vi.mocked(globalThis.messnamed).mockImplementation((bus, ...args) => {
      if (String(args[2]).includes('"index":9')) {
        throw new Error("Max went away");
      }

      return heard?.(bus, ...args);
    });

    expect(await write(["t0/d0/h206", "t0/d0/h9"])).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        detail:
          'envelope "t0/d0/h206": mapped to slot "Automation 001"; ' +
          'envelope "t0/d0/h9": Max went away',
      }),
    );
    expect(heardOp(wrapper, "map").map((m) => m.slot)).toStrictEqual([1]);
  });

  describe("at the request deadline", () => {
    useFakeDate();

    it("sends no lookup once the time is gone, and says which lines are left", async () => {
      const deadline = Date.now() + 1000;

      setupTrack();
      answerAsWrapper([{ slot: 2, index: 206, name: "Main Vol" }]);
      vi.mocked(requestNode).mockImplementation(async () => {
        vi.setSystemTime(deadline + 1);

        return { success: true, result: { available: true, result: {} } };
      });

      expect(
        await write(["t0/d0/h206", "t0/d0/h9"], { deadline }),
      ).toStrictEqual(
        expect.objectContaining({
          envelopes: 1,
          detail:
            'the request ran out of time; envelopes not written, re-run for "t0/d0/h9"',
        }),
      );
      expect(listCalls()).toBe(0);
    });

    it("keeps the slot an earlier line mapped when the next write runs out of time", async () => {
      const deadline = Date.now() + 1000;

      setupTrack();

      const wrapper = answerAsWrapper(FULL_BANK.slice(0, 1));

      vi.mocked(requestNode).mockImplementation(async (route) => {
        if (route === ENVELOPE_ROUTES.write) {
          vi.setSystemTime(deadline + 1);
        }

        return {
          success: true,
          result: { available: true, result: { envelopes: [] } },
        };
      });

      expect(
        await write(["t0/d0/h206", "t0/d0/h9"], { deadline }),
      ).toStrictEqual(
        expect.objectContaining({
          envelopes: 1,
          detail:
            'envelope "t0/d0/h206": mapped to slot "Automation 002"; ' +
            'the request ran out of time; already changed: mapped to slot "Automation 003"; ' +
            'envelopes not written, re-run for "t0/d0/h9"',
        }),
      );
      expect(heardOp(wrapper, "map").map((m) => m.slot)).toStrictEqual([2, 3]);
    });
  });
});
