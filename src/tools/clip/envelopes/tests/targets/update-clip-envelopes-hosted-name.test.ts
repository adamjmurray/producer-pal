// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip's `envelopes` on a hosted plug-in's param named by its wrapper's
// path and the plug-in's own name for the param.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { type WrapperMessage } from "#src/tools/device/tests/helpers/plugin-host-wrapper-fixtures.ts";
import {
  answerAsWrapper,
  answerRoutes,
  heardOp,
  routeArgs,
  setupTrack,
  type Wrapper,
} from "./hosted-envelope-test-helpers.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

/**
 * Write one point to a target on clip 123.
 * @param target - The target
 * @returns The clip's entry
 */
function write(target: string) {
  return updateClip({ id: "123", envelopes: `${target}: 1|1 0.2` });
}

describe("updateClip - envelopes on a hosted param named by path and name", () => {
  let wrapper: Wrapper;

  /**
   * Make the wrapper's plug-in have these params by this name.
   * @param matches - The plug-in's numbers for the params the name reaches
   */
  function nameReaches(...matches: number[]): void {
    wrapper.lookup = () => ({
      success: true,
      matches: matches.map((index) => ({ index, name: "Cutoff" })),
    });
  }

  beforeEach(() => {
    clearMockRegistry();
    setupMidiClipMock(setupUpdateClipMocks().clip123);
    answerRoutes();
    setupTrack();
    wrapper = answerAsWrapper([{ slot: 2, index: 206, name: "Cutoff" }]);
  });

  it("writes the slot of the param the name reaches", async () => {
    nameReaches(206);

    const result = await write("t0/d0/Cutoff");

    expect(result).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
    expect(heardOp(wrapper, "lookup")).toStrictEqual([
      expect.objectContaining({ name: "Cutoff" }),
    ]);
    expect(routeArgs(ENVELOPE_ROUTES.write)).toStrictEqual(
      expect.objectContaining({ device: "d0", parameter: 2 }),
    );
  });

  it("refuses the name and the h id of one param together", async () => {
    nameReaches(206);

    const result = await updateClip({
      id: "123",
      envelopes: "t0/d0/Cutoff: 1|1 0.2\nt0/d0/h206: 1|1 0.4",
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: expect.stringContaining("are the same parameter") as string,
      }),
    );
  });

  it("names the ids when the name reaches more than one param", async () => {
    nameReaches(12, 40);

    expect(await write("t0/d0/cutoff")).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail:
          'envelope "t0/d0/cutoff": "cutoff" names 2 params on t0/d0 (h12, h40), so nothing was written. Use one of those ids as the target, like t0/d0/h12.',
      }),
    );
  });

  it("leaves a name the plug-in doesn't have to the wrapper's own params", async () => {
    nameReaches();

    // The wrapper's Live params are its automation slots, by Live's names.
    expect(await write("t0/d0/Slot 001")).toStrictEqual(
      expect.objectContaining({ envelopes: 1 }),
    );
    expect(await write("t0/d0/Resonance")).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail:
          'envelope "t0/d0/Resonance": t0/d0 has no param named "Resonance"',
      }),
    );
  });

  it.each<[WrapperMessage | undefined, string]>([
    [
      { success: false, error: "unknown op: lookup" },
      "this wrapper is out of date; create the hosted plug-in again",
    ],
    [
      { success: false, error: "boom" },
      "couldn't look up the param's name: boom",
    ],
    [undefined, "the hosted plug-in didn't answer"],
  ])("says why when the wrapper answers %j", async (reply, why) => {
    if (reply != null) {
      wrapper.lookup = () => reply;
    }

    expect(await write("t0/d0/Cutoff")).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail: `envelope "t0/d0/Cutoff": ${why}`,
      }),
    );
  });
});
