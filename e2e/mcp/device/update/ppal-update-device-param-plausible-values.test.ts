// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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

  describe("a quantized param whose labels carry a unit", () => {
    it("writes Simpler's Filter Slope by its label or its bare number", async () => {
      const deviceId = await createTestDevice(ctx.client!, "Simpler", "t8");

      for (const [sent, label] of [
        ["12 dB", "12 dB"],
        ["24", "24 dB"],
      ] as const) {
        const { data, warnings } = await writeParam(
          ctx.client!,
          deviceId,
          "Filter Slope",
          sent,
        );

        expect(warnings).toStrictEqual([]);
        expect(data.params).toStrictEqual([
          { id: expect.any(String), name: "Filter Slope", value: label },
        ]);

        const param = await readParam(ctx.client!, deviceId, "Filter Slope");

        expect(param.value).toBe(label);
      }
    });
  });
});
