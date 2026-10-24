// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for device param writes that used to refuse a value a model
 * plausibly sends.
 *
 * Which stock params expose an Off/On pair or an `inf` sentinel, and how Live
 * spells them back, is Live's own answer — a mock can only assert what we
 * already believed.
 *
 * Run with: npm run e2e:mcp -- device/update/ppal-update-device-param-plausible-values
 */
import { describe, expect, it } from "vitest";
import {
  createGlueCompressor,
  expectParamRefused,
  writeParam,
} from "../helpers/update-device-param-test-helpers";
import { createTestDevice, setupMcpTestContext } from "../../mcp-test-helpers";
import { readParam } from "../helpers/device-param-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-update-device param writes a model plausibly sends", () => {
  describe("an Off/On param", () => {
    it.each([
      ["false", "Off"],
      ["0", "Off"],
      ["off", "Off"],
      ["true", "On"],
      ["1", "On"],
      ["on", "On"],
    ])("accepts %s", async (value, label) => {
      const deviceId = await createGlueCompressor(ctx.client!);
      const { data, warnings } = await writeParam(
        ctx.client!,
        deviceId,
        "Device On",
        value,
      );

      expect(warnings).toStrictEqual([]);
      expect(data.params).toStrictEqual([
        { id: expect.any(String), name: "Device On", value: label },
      ]);
    });

    it("still refuses a value that names neither state", async () => {
      const deviceId = await createGlueCompressor(ctx.client!);
      const written = await writeParam(
        ctx.client!,
        deviceId,
        "Device On",
        "peak",
      );

      expectParamRefused(written, "Device On", "Options: Off, On");
    });
  });

  describe("the inf sentinel", () => {
    it("accepts the bare prefix", async () => {
      const deviceId = await createTestDevice(ctx.client!, "Compressor", "t2");
      const { data, warnings } = await writeParam(
        ctx.client!,
        deviceId,
        "Ratio",
        "inf",
      );

      expect(warnings).toStrictEqual([]);
      expect(data.params).toStrictEqual([
        { id: expect.any(String), name: "Ratio", value: "inf : 1" },
      ]);
    });
  });

  describe("a quantized param whose labels are numbers", () => {
    it("writes Chorus-Ensemble's Delay Taps by its numeric label", async () => {
      // t8 is an empty MIDI track; an audio effect there is fine.
      const deviceId = await createTestDevice(
        ctx.client!,
        "Chorus-Ensemble",
        "t8",
      );

      for (const taps of [1, 2]) {
        const { data, warnings } = await writeParam(
          ctx.client!,
          deviceId,
          "Delay Taps",
          String(taps),
        );

        expect(warnings).toStrictEqual([]);
        expect(data.params).toStrictEqual([
          { id: expect.any(String), name: "Delay Taps", value: taps },
        ]);

        const param = await readParam(ctx.client!, deviceId, "Delay Taps");

        expect(param.value).toBe(taps);
      }
    });
  });

  describe("a param whose name Live pads with a trailing space", () => {
    it('writes Operator\'s "A Fix On " by its trimmed name', async () => {
      const deviceId = await createTestDevice(ctx.client!, "Operator", "t8");

      for (const [sent, label] of [
        ["A Fix On ", "Off"],
        ["A Fix On", "On"],
      ] as const) {
        const { data, warnings } = await writeParam(
          ctx.client!,
          deviceId,
          sent,
          label,
        );

        expect(warnings).toStrictEqual([]);
        expect(data.params).toStrictEqual([
          { id: expect.any(String), name: "A Fix On", value: label },
        ]);
      }

      const param = await readParam(ctx.client!, deviceId, "A Fix On");

      expect(param.value).toBe("On");
    });
  });

  describe("a quantized param whose labels carry a unit", () => {
    it("writes Simpler's Filter Slope by its label or its bare number", async () => {
      const deviceId = await createTestDevice(ctx.client!, "Simpler", "t8");

      for (const [sent, label] of [
        ["12 dB", "12 dB"],
        ["24", "24 dB"],
      ] as const) {
        await expectParamWritten(deviceId, "Filter Slope", sent, label);
      }
    });

    it("writes Auto Filter's Filter Slope when the label has no space", async () => {
      const deviceId = await createTestDevice(ctx.client!, "Auto Filter", "t8");

      for (const label of ["12dB", "24dB"]) {
        await expectParamWritten(
          deviceId,
          "Filter Slope",
          `${label.slice(0, 2)} dB`,
          label,
        );
      }
    });
  });

  describe("a bare number on a param whose options are words", () => {
    it("refuses 0 on Dynamic Tube's Tube Type instead of landing on C", async () => {
      const deviceId = await createTestDevice(
        ctx.client!,
        "Dynamic Tube",
        "t8",
      );
      const written = await writeParam(ctx.client!, deviceId, "Tube Type", "0");

      expectParamRefused(written, "Tube Type", "Options: A, B, C");
    });
  });

  describe("a label written with different case, spacing or hyphens", () => {
    // [device, param, sent, label Live reports back]
    const cases = [
      ["Analog", "LFO1 SncRate", "4 d", "4d"],
      ["Analog", "LFO1 SncRate", "1/4D", "1/4d"],
      ["Analog", "LFO1 SncRate", "1 / 32", "1/32"],
      ["Auto Filter", "Filter Type", "Lowpass", "Low-pass"],
      ["Echo", "Channel Mode", "Mid / Side", "Mid/Side"],
    ] as const;

    it.each(cases)(
      "%s %s: writes %s as %s",
      async (device, param, sent, label) => {
        const deviceId = await createTestDevice(ctx.client!, device, "t8");

        await expectParamWritten(deviceId, param, sent, label);
      },
    );
  });
});

/**
 * Write a param, then assert it landed on `label` with no warnings, both in
 * the result and when read back.
 * @param deviceId - Device to write to
 * @param param - Param name
 * @param sent - Value to send
 * @param label - Label Live reports back
 */
async function expectParamWritten(
  deviceId: string,
  param: string,
  sent: string,
  label: string,
): Promise<void> {
  const { data, warnings } = await writeParam(
    ctx.client!,
    deviceId,
    param,
    sent,
  );

  expect(warnings).toStrictEqual([]);
  expect(data.params).toStrictEqual([
    { id: expect.any(String), name: param, value: label },
  ]);

  const read = await readParam(ctx.client!, deviceId, param);

  expect(read.value).toBe(label);
}
