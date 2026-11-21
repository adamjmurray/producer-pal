// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip's `envelopes` with a point's value written as what Live
// displays, `(-6 dB)`, which is converted to a raw value before the write.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { formatEnvelopeNotation } from "#src/notation/barbeat/envelope/envelope-notation.ts";
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
        parameters: children("on", "type", "wide", "ratio", "rate"),
      },
    });
    // A display with round brackets, which a read prints as square ones.
    registerMockObject("rate", {
      type: "DeviceParameter",
      path: device.parameter(4),
      properties: {
        name: "Rate",
        original_name: "Rate",
        is_quantized: 1,
        value: 0,
        min: 0,
        max: 1,
        value_items: ["1/4", "1/4 (dotted)"],
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
    registerMockObject("pan", {
      type: "DeviceParameter",
      path: `${livePath.track(0).mixerDevice()} panning`,
      properties: {
        name: "Track Panning",
        original_name: "Track Panning",
        is_quantized: 0,
        value: 0,
        min: -1,
        max: 1,
      },
      methods: {
        str_for_value: (raw: unknown) => {
          const pan = Math.round(Number(raw) * 50);

          return pan === 0 ? "C" : `${Math.abs(pan)}${pan < 0 ? "L" : "R"}`;
        },
      },
    });
    // Displays with a colon, as Compressor's Ratio does.
    registerMockObject("ratio", {
      type: "DeviceParameter",
      path: device.parameter(3),
      properties: {
        name: "Ratio",
        original_name: "Ratio",
        is_quantized: 0,
        value: 0,
        min: 0,
        max: 1,
      },
      methods: {
        str_for_value: (raw: unknown) =>
          `${(1 + Number(raw) * 6).toFixed(2)} : 1`,
      },
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

  it("writes back a read's points whose display holds a colon", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: "t0/d0/Ratio: 1|1 0.5 (4.00 : 1) / 3|1 0.25 (2.50 : 1)",
    });

    expect(result).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
    expect(writtenValues()).toStrictEqual([0.5, 0.25]);
  });

  it("writes back a read's display that held round brackets", async () => {
    const read = formatEnvelopeNotation(
      [{ time: 0, value: 1, display: "1/4 (dotted)" }],
      { timeSigNumerator: 4, timeSigDenominator: 4 },
    );
    // Leave the raw value out, so the display is the one written.
    const line = `t0/d0/Rate: ${read.replace(" 1 (", " (")}`;

    expect(line).toBe("t0/d0/Rate: 1|1 (1/4 [dotted])");

    const result = await updateClip({ id: "123", envelopes: line });

    expect(result).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
    expect(writtenValues()).toStrictEqual([1]);
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
    ["volume: 1|1 (30 dB)", [1], "(30 dB) as 0.0 dB"],
    ["volume: 1|1 (+3 dB)", [1], "(+3 dB) as 0.0 dB"],
    ["volume: 1|1 (-90 dB)", [0], "(-90 dB) as -60.0 dB"],
    ["pan: 1|1 (60R) / 2|1 (25L)", [1, -0.5], "(60R) as 50R"],
  ])(
    "writes the nearest end for %s, and says so",
    async (line, values, clamped) => {
      const result = await updateClip({ id: "123", envelopes: line });
      const target = line.slice(0, line.indexOf(":"));

      expect(writtenValues()).toStrictEqual(
        values.map((value) => expect.closeTo(value, 2)),
      );
      expect(result).toStrictEqual({
        id: "123",
        path: "t0/s0",
        envelopes: 1,
        detail: `envelope "${target}": past the range, wrote ${clamped}`,
      });
    },
  );

  it("names each value it clamped once, in one note for the line", async () => {
    const result = await updateClip({
      id: "123",
      envelopes:
        "volume: 1|1 (-30 dB) / 1|2 (30 dB) / 1|3 (-90 dB) / 1|4 (30 dB)",
    });

    expect(writtenValues()).toStrictEqual(
      [0.5, 1, 0, 1].map((value) => expect.closeTo(value, 2)),
    );
    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      envelopes: 1,
      detail:
        'envelope "volume": past the range, wrote (30 dB) as 0.0 dB, (-90 dB) as -60.0 dB',
    });
  });

  it("says nothing for a value at either end of the range", async () => {
    const result = await updateClip({
      id: "123",
      envelopes:
        "volume: 1|1 (-60 dB) / 2|1 (0 dB)\npan: 1|1 (50L) / 2|1 (50R)",
    });

    expect(result).toStrictEqual({ id: "123", path: "t0/s0", envelopes: 2 });
  });

  it.each([
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

  it("rolls each point between the raw values its rand() ends stand for", async () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(1 / 3);

    const result = await updateClip({
      id: "123",
      envelopes:
        "volume: 1|1x2@n/4 rand((-60 dB), (-30 dB)) / 2|1 rand(0, (-30 dB))",
    });
    const values = writtenValues();

    expect(result).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
    expect(values[0]).toBeCloseTo(0, 2);
    expect(values[1]).toBeCloseTo(0.5, 2);
    // A rolled value keeps 6 significant digits.
    expect(String(values[2]).length).toBeLessThanOrEqual(8);
    expect(values[2]).toBeCloseTo(0.5 / 3, 2);
    vi.restoreAllMocks();
  });

  it("keeps each value in place on a line that mixes rand() with other points", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    await updateClip({
      id: "123",
      envelopes:
        "volume: 1|1 (0 dB) / 2|1 rand((-30 dB), (0 dB)) / 3|1 0.25 / 4|1 rand(0.1, 0.2)",
    });

    const values = writtenValues();

    expect(values).toHaveLength(4);
    expect(values[0]).toBeCloseTo(1, 2);
    expect(values[1]).toBeCloseTo(0.5, 2);
    expect(values[2]).toBe(0.25);
    expect(values[3]).toBe(0.1);
    vi.restoreAllMocks();
  });

  it("never rounds a roll past its range", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9999999);

    await updateClip({
      id: "123",
      envelopes: "volume: 1|1 rand(0.12345678, 0.12345679)",
    });

    expect(writtenValues()).toStrictEqual([0.12345679]);
    vi.restoreAllMocks();
  });

  it("rolls a range on a parameter that can't be read, leaving the write to check it", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = await updateClip({
      id: "123",
      envelopes: "send5: 1|1 rand(0.5, 2)",
    });

    expect(result).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
    expect(writtenValues()).toStrictEqual([0.5]);
    vi.restoreAllMocks();
  });

  it("says when a rand() end written as a display value was clamped", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: "volume: 1|1 rand((-30 dB), (6 dB))",
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        detail: expect.stringContaining("past the range, wrote (6 dB) as"),
      }),
    );
  });

  it.each([
    [
      "volume: 1|1 0.5 / 2|1x4@n/4 rand()",
      "not written: rand() end -1 is outside the parameter's range 0..1",
    ],
    [
      "pan: 1|1 rand(-1, 1.2)",
      "not written: rand() end 1.2 is outside the parameter's range -1..1",
    ],
    [
      "t0/d0/Filter Type: 1|1 rand((Low-pass), (Notch))",
      "not written: rand() can't roll between an option list's labels; write each point's option",
    ],
  ])("refuses %s whatever it would roll", async (line, why) => {
    await expectRefused(line, why);
  });
});
