// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip's `envelopes` on a rack chain's own volume, pan and sends, named
// by the parameter's id or by the chain's path and the mixer name.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { answerEnvelopeRoutes } from "#src/tools/clip/envelopes/tests/envelope-route-test-helpers.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
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

const NOTATION = "1|1 0 / 3|1 0.8";

/** The volume of chain 1 of the rack at t0/d0. */
const CHAIN_VOLUME_ID = "477";

/** Send 1 of a chain two racks deep. */
const NESTED_SEND_ID = "482";

/** The pan of return chain 0 of the same rack. */
const RETURN_PAN_ID = "483";

/** The volume of a chain of a rack that sits inside that return chain. */
const RETURN_DEVICE_CHAIN_ID = "484";

/**
 * Expect one write, to a parameter.
 * @param target - The device and parameter the route was given
 */
function expectWriteTo(target: { device: string; parameter: string }): void {
  expect(requestNode).toHaveBeenCalledExactlyOnceWith(
    ENVELOPE_ROUTES.write,
    expect.objectContaining({ track: "t0", slot: 0, ...target }),
    expect.anything(),
  );
}

describe("updateClip - envelopes on a rack chain's own mixer", () => {
  beforeEach(() => {
    const chain = livePath.track(0).device(0).chain(1);

    setupMidiClipMock(setupUpdateClipMocks().clip123);
    registerMockObject("rack", {
      type: "RackDevice",
      path: livePath.track(0).device(0),
    });
    registerMockObject("chain", { type: "Chain", path: chain });
    registerMockObject("other-track-chain", {
      type: "Chain",
      path: livePath.track(1).device(0).chain(0),
    });
    registerMockObject(CHAIN_VOLUME_ID, {
      type: "DeviceParameter",
      path: `${chain} mixer_device volume`,
    });
    registerMockObject(NESTED_SEND_ID, {
      type: "DeviceParameter",
      path: `${chain.device(0).chain(0)} mixer_device sends 1`,
    });
    registerMockObject("return-chain", {
      type: "Chain",
      path: livePath.track(0).device(0).returnChain(0),
    });
    registerMockObject(RETURN_PAN_ID, {
      type: "DeviceParameter",
      path: `${livePath.track(0).device(0).returnChain(0)} mixer_device panning`,
    });
    registerMockObject(RETURN_DEVICE_CHAIN_ID, {
      type: "DeviceParameter",
      path: `${livePath.track(0).device(0).returnChain(0).device(0).chain(0)} mixer_device volume`,
    });
    mockNonExistentObjects();
    answerEnvelopeRoutes();
  });

  it("writes the parameter an id names, by its mixer name", async () => {
    await updateClip({
      id: "123",
      envelopes: `${CHAIN_VOLUME_ID}: ${NOTATION}`,
    });

    expectWriteTo({ device: "d0/c1", parameter: "volume" });
  });

  it("walks nested racks to a chain's send", async () => {
    await updateClip({
      id: "123",
      envelopes: `${NESTED_SEND_ID}: ${NOTATION}`,
    });

    expectWriteTo({ device: "d0/c1/d0/c0", parameter: "send1" });
  });

  it("writes the parameter a chain path and mixer name reach", async () => {
    await updateClip({ id: "123", envelopes: `t0/d0/c1/volume: ${NOTATION}` });

    expectWriteTo({ device: "d0/c1", parameter: "volume" });
  });

  it.each([RETURN_PAN_ID, "t0/d0/rc0/pan"])(
    "writes a return chain's own mixer, named as %s",
    async (target) => {
      await updateClip({ id: "123", envelopes: `${target}: ${NOTATION}` });

      expectWriteTo({ device: "d0/rc0", parameter: "pan" });
    },
  );

  it("still refuses a chain of a rack inside a return chain", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: `${RETURN_DEVICE_CHAIN_ID}: ${NOTATION}`,
    });

    expect(requestNode).not.toHaveBeenCalled();
    expect(result).toStrictEqual(
      expect.objectContaining({
        detail: `envelope "${RETURN_DEVICE_CHAIN_ID}": id ${RETURN_DEVICE_CHAIN_ID} is inside a rack return chain, which clip automation can't reach`,
      }),
    );
  });

  it("refuses the path and the id of one parameter together", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: `t0/d0/c1/volume: ${NOTATION}\n${CHAIN_VOLUME_ID}: ${NOTATION}`,
    });

    expect(requestNode).not.toHaveBeenCalled();
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: expect.stringContaining("are the same parameter") as string,
      }),
    );
  });

  it.each([
    ["t0/d0/c1/send3", "t0/d0/c1 has no send3"],
    ["t0/d0/c5/volume", 'chain at envelopes target "t0/d0/c5" does not exist'],
    ["t0/d0/volume", 'envelopes target "t0/d0" resolves to device, not chain'],
    [
      "t1/d0/c0/volume",
      "t1/d0/c0 is not on the clip's track (t0), and a clip can only automate its own track",
    ],
  ])("says why %s reaches nothing", async (target, why) => {
    const result = await updateClip({
      id: "123",
      envelopes: `${target}: ${NOTATION}`,
    });

    expect(requestNode).not.toHaveBeenCalled();
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail: `envelope "${target}": ${why}`,
      }),
    );
  });
});
