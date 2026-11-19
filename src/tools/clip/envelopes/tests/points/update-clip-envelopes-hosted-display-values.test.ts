// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip's `envelopes` with display values, `(-6 dB)`, on a hosted
// plug-in's param: its wrapper is asked where the param shows each one.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import {
  answerAsWrapper,
  answerRoutes,
  heardOp,
  routeArgs,
  setupTrack,
  type Wrapper,
} from "#src/tools/clip/envelopes/tests/targets/hosted-envelope-test-helpers.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

/**
 * Make the wrapper answer a `find` with these values, in order.
 * @param wrapper - The fake wrapper
 * @param values - What it found for each display value asked
 */
function finds(wrapper: Wrapper, values: object[]): void {
  wrapper.find = () => ({
    success: true,
    index: 56,
    name: "Gain",
    low: " -60.0 dB",
    high: "12.0 dB ",
    values,
  });
}

/**
 * Write one line to h56 and expect it refused, with no slot mapped.
 * @param wrapper - The fake wrapper
 * @param points - The line's notation
 * @param why - What the entry says after the target
 */
async function expectRefused(
  wrapper: Wrapper,
  points: string,
  why: string,
): Promise<void> {
  const result = await updateClip({
    id: "123",
    envelopes: `t0/d0/h56: ${points}`,
  });

  expect(heardOp(wrapper, "map")).toHaveLength(0);
  expect(routeArgs(ENVELOPE_ROUTES.write)).toBeUndefined();
  expect(result).toStrictEqual(
    expect.objectContaining({
      envelopes: 0,
      detail: `envelope "t0/d0/h56": ${why}`,
    }),
  );
}

describe("updateClip - display values on a hosted plug-in's param", () => {
  let wrapper: Wrapper;

  beforeEach(() => {
    clearMockRegistry();
    setupMidiClipMock(setupUpdateClipMocks().clip123);
    answerRoutes();
    setupTrack();
    wrapper = answerAsWrapper();
  });

  it("asks the wrapper for each value once and writes what it found", async () => {
    finds(wrapper, [{ value: 0.75 }, { value: 0.25 }]);

    const result = await updateClip({
      id: "123",
      envelopes: "t0/d0/h56: 1|1 (-6 dB) / 2|1 0.5 / 3|1 (-30) / 4|1 (-6 dB)",
    });

    expect(result).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
    expect(heardOp(wrapper, "find")).toStrictEqual([
      expect.objectContaining({
        index: 56,
        values: [
          { text: "-6 dB", number: -6 },
          { text: "-30", number: -30, bare: true },
        ],
      }),
    ]);
    expect(routeArgs(ENVELOPE_ROUTES.write)?.points).toStrictEqual(
      [0.75, 0.5, 0.25, 0.75].map((value) =>
        expect.objectContaining({ value }),
      ),
    );
  });

  it("asks nothing for a line of raw values", async () => {
    await updateClip({ id: "123", envelopes: "t0/d0/h56: 1|1 0.5" });

    expect(heardOp(wrapper, "find")).toHaveLength(0);
  });

  it("writes the nearest end for a value past the range, and says so", async () => {
    finds(wrapper, [
      { value: 0.5, display: "-24.0 dB" },
      { value: 1, display: " 12.0 dB ", outside: true },
    ]);

    const result = await updateClip({
      id: "123",
      envelopes: "t0/d0/h56: 1|1 (-24 dB) / 2|1 (24 dB)",
    });

    expect(routeArgs(ENVELOPE_ROUTES.write)?.points).toStrictEqual(
      [0.5, 1].map((value) => expect.objectContaining({ value })),
    );
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        detail: expect.stringMatching(
          /^envelope "t0\/d0\/h56": .*; past the range, wrote \(24 dB\) as 12\.0 dB$/,
        ),
      }),
    );
  });

  it("says what the param shows when nothing matches", async () => {
    finds(wrapper, [
      { error: 'nothing displays as "loud"; it shows values like Off, On' },
    ]);

    await expectRefused(
      wrapper,
      "1|1 (loud)",
      'not written: nothing displays as "loud"; it shows values like Off, On',
    );
  });

  it.each([
    [
      { success: false, error: "unknown op: find" },
      "not written: this wrapper is out of date; create the hosted plug-in again",
    ],
    [
      { success: false, error: "no param 56" },
      "not written: couldn't convert a display value: no param 56",
    ],
    [undefined, "not written: the hosted plug-in didn't answer"],
    [
      { success: true, values: [] },
      "not written: the hosted plug-in didn't answer",
    ],
  ])("refuses the line when the wrapper answers %j", async (reply, why) => {
    if (reply != null) {
      wrapper.find = () => reply;
    }

    await expectRefused(wrapper, "1|1 (-6 dB)", why);
  });
});
