// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip's `envelopes` on a device param named by its device's path and
// the param's name.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { parseNameTarget } from "#src/tools/clip/envelopes/targets/envelope-name-target.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import { answerEnvelopeRoutes } from "#src/tools/clip/envelopes/tests/envelope-route-test-helpers.ts";
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

/**
 * Register a named param.
 * @param id - The param's id
 * @param path - Its Live path
 * @param name - Its name
 */
function registerParam(id: string, path: string, name: string): void {
  registerMockObject(id, {
    type: "DeviceParameter",
    path,
    properties: { name, original_name: name, min: 0, max: 1 },
    methods: { str_for_value: (value: unknown) => `${String(value)} Hz` },
  });
}

/**
 * Expect one write, to a parameter.
 * @param target - The device and parameter the route was given
 */
function expectWriteTo(target: { device: string; parameter: number }): void {
  expect(requestNode).toHaveBeenCalledExactlyOnceWith(
    ENVELOPE_ROUTES.write,
    expect.objectContaining({ track: "t0", slot: 0, ...target }),
    expect.anything(),
  );
}

describe("parseNameTarget", () => {
  it.each([
    ["t0/d0/Filter Freq", "t0/d0", "Filter Freq"],
    ["rt1/d2/c0/d1/Dry/Wet", "rt1/d2/c0/d1", "Dry/Wet"],
    ["t0/d0/volume", "t0/d0", "volume"],
    ["t0/d0/A: B", "t0/d0", "A: B"],
  ])("reads %s", (target, devicePath, name) => {
    expect(parseNameTarget(target)).toStrictEqual({ devicePath, name });
  });

  it.each([
    "472",
    "volume",
    "t0/volume",
    "t0/d0",
    "t0/d0/c1/volume",
    "t0/d0/rc0/pan",
    "t0/d0/ ",
    "d0/Filter Freq",
  ])("leaves %s to the other target forms", (target) => {
    expect(parseNameTarget(target)).toBeNull();
  });
});

describe("updateClip - envelopes on a param named by device path and name", () => {
  beforeEach(() => {
    const device = livePath.track(0).device(0);
    const nested = device.chain(1).device(0);

    setupMidiClipMock(setupUpdateClipMocks().clip123);
    registerMockObject("device", {
      type: "Device",
      path: device,
      properties: { parameters: children("90", "91", "92", "93") },
    });
    registerParam("90", device.parameter(0), "Device On");
    registerParam("91", device.parameter(1), "Filter Freq");
    registerParam("92", device.parameter(2), "Width");
    registerParam("93", device.parameter(3), "Width");
    registerMockObject("nested", {
      type: "Device",
      path: nested,
      properties: { parameters: children("95", "96") },
    });
    registerParam("95", nested.parameter(0), "Device On");
    registerParam("96", nested.parameter(1), "Dry/Wet");
    registerMockObject("other-track-device", {
      type: "Device",
      path: livePath.track(1).device(0),
      properties: { parameters: children() },
    });
    mockNonExistentObjects();
    answerEnvelopeRoutes();
  });

  it("writes the param the name reaches, ignoring case", async () => {
    await updateClip({
      id: "123",
      envelopes: `t0/d0/filter freq: ${NOTATION}`,
    });

    expectWriteTo({ device: "d0", parameter: 1 });
  });

  it("reads a slash in the name as part of the name", async () => {
    await updateClip({
      id: "123",
      envelopes: `t0/d0/c1/d0/Dry/Wet: ${NOTATION}`,
    });

    expectWriteTo({ device: "d0/c1/d0", parameter: 1 });
  });

  it("refuses the name and the id of one parameter together", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: `t0/d0/Filter Freq: ${NOTATION}\n91: ${NOTATION}`,
    });

    expect(requestNode).not.toHaveBeenCalled();
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: expect.stringContaining("are the same parameter") as string,
      }),
    );
  });

  it.each([
    [
      "t0/d0/Width",
      '"Width" names 2 params on t0/d0 (id device) — id 92 (0 Hz to 1 Hz), id 93 (0 Hz to 1 Hz) — so nothing was written. Use one of those ids as the target.',
    ],
    ["t0/d0/Cutoff", 't0/d0 has no param named "Cutoff"'],
    [
      "t0/d0/pC1/d0/Cutoff",
      't0/d0 has no param named "pC1/d0/Cutoff" (a device path here takes only dN and cN segments)',
    ],
    [
      "t1/d0/Cutoff",
      "t1/d0 is not on the clip's track (t0), and a clip can only automate its own track",
    ],
  ])("says why %s reaches no single param", async (target, why) => {
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

  it("says when the path names no device", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: `t0/d5/Cutoff: ${NOTATION}`,
    });

    expect(requestNode).not.toHaveBeenCalled();
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail: expect.stringContaining("t0/d5") as string,
      }),
    );
  });
});
