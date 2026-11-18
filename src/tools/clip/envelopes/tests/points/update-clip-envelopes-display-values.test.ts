// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip's `envelopes` with a point's value written as what Live
// displays, `(-6 dB)`, which is converted to a raw value before the write.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import { answerEnvelopeRoutes } from "#src/tools/clip/envelopes/tests/envelope-route-test-helpers.ts";
import {
  answerAsWrapper,
  setupTrack,
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
 * The values of the points the write route was sent.
 * @returns One raw value per point
 */
function writtenValues(): number[] {
  const call = vi
    .mocked(requestNode)
    .mock.calls.find(([route]) => route === ENVELOPE_ROUTES.write);
  const args = call?.[1] as { points: { value: number }[] } | undefined;

  return (args?.points ?? []).map((point) => point.value);
}

/**
 * Write one line to clip 123 and expect it refused before any request.
 * @param line - The `envelopes` line
 * @param why - What the entry says after the target
 */
async function expectRefused(line: string, why: string): Promise<void> {
  const result = await updateClip({ id: "123", envelopes: line });
  const target = line.slice(0, line.lastIndexOf(":"));

  expect(requestNode).not.toHaveBeenCalled();
  expect(result).toStrictEqual(
    expect.objectContaining({
      envelopes: 0,
      detail: `envelope "${target}": ${why}`,
    }),
  );
}

describe("updateClip - envelope points written as display values", () => {
  let volume: RegisteredMockObject;

  beforeEach(() => {
    const device = livePath.track(0).device(0);

    setupMidiClipMock(setupUpdateClipMocks().clip123);
    // A fader that reads -60..0 dB over raw 0..1, so nothing maps straight across.
    volume = registerMockObject("volume", {
      type: "DeviceParameter",
      path: `${livePath.track(0).mixerDevice()} volume`,
      properties: {
        name: "Track Volume",
        original_name: "Track Volume",
        is_quantized: 0,
        value: 0.5,
        min: 0,
        max: 1,
      },
      methods: {
        str_for_value: (raw: unknown) =>
          `${(Number(raw) * 60 - 60).toFixed(1)} dB`,
      },
    });
    registerMockObject("device", {
      type: "Device",
      path: device,
      properties: {
        class_display_name: "Auto Filter",
        parameters: children("on", "type", "wide"),
      },
    });
    registerMockObject("type", {
      type: "DeviceParameter",
      path: device.parameter(1),
      properties: {
        name: "Filter Type",
        original_name: "Filter Type",
        is_quantized: 1,
        value: 0,
        min: 0,
        max: 2,
        value_items: ["Low-pass", "High-pass", "Notch"],
      },
    });
    // Raw and display match (0..127), so a display value is its own raw value.
    registerMockObject("wide", {
      type: "DeviceParameter",
      path: device.parameter(2),
      properties: {
        name: "Amount",
        original_name: "Amount",
        is_quantized: 0,
        value: 0,
        min: 0,
        max: 127,
      },
      methods: { str_for_value: (raw: unknown) => String(raw) },
    });
    mockNonExistentObjects();
    answerEnvelopeRoutes({ parameter: { min: 0, max: 127, quantized: false } });
  });

  it("writes the raw value each display stands for, beside plain raw ones", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: "volume: 1|1 (-30 dB) / 2|1 0.25 / 3|1 (0 dB) _ 4|1 (-30dB)",
    });
    const values = writtenValues();

    expect(result).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
    expect(values[0]).toBeCloseTo(0.5, 2);
    expect(values[1]).toBe(0.25);
    expect(values[2]).toBeCloseTo(1, 2);
    expect(values[3]).toBeCloseTo(0.5, 2);
  });

  it("converts a value written twice only once", async () => {
    await updateClip({ id: "123", envelopes: "volume: 1|1 (-30 dB)" });

    const once = volume.call.mock.calls.length;

    volume.call.mockClear();
    await updateClip({
      id: "123",
      envelopes: "volume: 1|1 (-30 dB) / 2|1 (-30 dB) / 3|1 (-30 dB)",
    });

    expect(volume.call.mock.calls).toHaveLength(once);
  });

  it("takes an option by its label", async () => {
    await updateClip({
      id: "123",
      envelopes: "t0/d0/Filter Type: 1|1 (High-pass) _ 2|1 (Notch)",
    });

    expect(writtenValues()).toStrictEqual([1, 2]);
  });

  it("leaves out the 0..1 note, since the values weren't spelled raw", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: "t0/d0/Amount: 1|1 (0.5) / 2|1 (1)",
    });

    expect(writtenValues()).toStrictEqual([0.5, 1]);
    expect(result).toStrictEqual({ id: "123", path: "t0/s0", envelopes: 1 });
  });

  it.each([
    [
      "volume: 1|1 (30 dB)",
      "not written: (30 dB) is outside the param's range, -60.0 dB to 0.0 dB",
    ],
    [
      "volume: 1|1 (200 Hz)",
      'not written: is measured in dB, so "200 Hz" was not written — send the value in dB',
    ],
    [
      "t0/d0/Filter Type: 1|1 (Comb)",
      'not written: "Comb" is not valid. Options: Low-pass, High-pass, Notch',
    ],
    [
      "send5: 1|1 (-6 dB)",
      "not written: the parameter can't be read to convert a display value; write raw values",
    ],
  ])("refuses %s, writing nothing", async (line, why) => {
    await expectRefused(line, why);
  });
});

describe("updateClip - display values on a hosted plug-in's param", () => {
  it("refuses them before a slot is mapped", async () => {
    setupMidiClipMock(setupUpdateClipMocks().clip123);
    setupTrack();
    answerAsWrapper();

    const result = await updateClip({
      id: "123",
      envelopes: "t0/d0/h56: 1|1 (50 %)",
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail:
          'envelope "t0/d0/h56": not written: a hosted plug-in\'s param takes raw values, not a display value in parentheses',
      }),
    );
  });
});
