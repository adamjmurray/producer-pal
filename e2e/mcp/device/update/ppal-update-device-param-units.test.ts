// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the unit on a written parameter value.
 *
 * These need a real Live. Which stock parameters carry a unit, and what their
 * ranges are, is Live's own answer — a mock can only assert whatever we already
 * believed. Glue Compressor alone covers both cases: Threshold and Dry/Wet
 * report a unit, Attack and Release display a bare number.
 *
 * Run with: npm run e2e:mcp -- device/update/ppal-update-device-param-units
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-update-device param units", () => {
  it("writes a value in the unit the param reports", async () => {
    const deviceId = await createTestDevice(
      ctx.client!,
      "Glue Compressor",
      "t0",
    );
    const { data, warnings } = await write(deviceId, "Threshold", "-20 dB");

    expect(warnings).toStrictEqual([]);
    expect(data.params).toStrictEqual([
      { id: expect.any(String), name: "Threshold", value: -20 },
    ]);
  });

  it("refuses a value in a unit the param doesn't use", async () => {
    const deviceId = await createTestDevice(
      ctx.client!,
      "Glue Compressor",
      "t0",
    );
    // Dry/Wet is a percentage. The number alone is in range, so before the unit
    // was checked this wrote 50% and reported success.
    const { data, warnings } = await write(deviceId, "Dry/Wet", "50 dB");

    expect(data.params).toBeUndefined();
    expect(warnings).toStrictEqual([
      expect.stringContaining('is measured in %, so "50 dB" was not written'),
    ]);
  });

  it("refuses a unit on a param that displays a bare number", async () => {
    const deviceId = await createTestDevice(
      ctx.client!,
      "Glue Compressor",
      "t0",
    );
    // Release runs 0.1-1.2 with no unit. "0.5 s" used to be folded to 500 ms,
    // land outside that range, and clamp to the 1.2 maximum.
    const { data, warnings } = await write(deviceId, "Release", "0.5 s");

    expect(data.params).toBeUndefined();
    expect(warnings).toStrictEqual([
      expect.stringContaining("displays a plain number from 0.1 to 1.2"),
    ]);
  });

  it("writes that same param when the unit is left off", async () => {
    const deviceId = await createTestDevice(
      ctx.client!,
      "Glue Compressor",
      "t0",
    );
    const { data, warnings } = await write(deviceId, "Release", "0.5");

    expect(warnings).toStrictEqual([]);
    // Release moves in coarse steps, so 0.5 lands on the nearest one.
    expect(data.params).toStrictEqual([
      { id: expect.any(String), name: "Release", value: expect.any(Number) },
    ]);
  });
});

/**
 * Write one param value and return the result with any warnings it raised.
 * @param deviceId - Device holding the parameter
 * @param name - Parameter to write
 * @param value - Value to request, unit and all
 * @returns The parsed result and its warnings
 */
async function write(
  deviceId: string,
  name: string,
  value: string,
): Promise<{ data: UpdateDeviceResult; warnings: string[] }> {
  const result = parseToolResultWithWarnings<UpdateDeviceResult>(
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: deviceId, params: [{ name, value }] },
    }),
  );

  await sleep(100);

  return result;
}

interface UpdateDeviceResult {
  params?: Array<{ id: string; name: string; value?: number | string }>;
}
