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
} from "./update-device-param-test-helpers";
import { createTestDevice, setupMcpTestContext } from "../../mcp-test-helpers";

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
      const { data, warnings } = await writeParam(
        ctx.client!,
        deviceId,
        "Device On",
        "peak",
      );

      expectParamRefused({ data, warnings }, "Device On", "Options: Off, On");
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
});
