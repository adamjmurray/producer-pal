// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the unit on a written parameter value.
 *
 * These need a real Live. Which stock parameters carry a unit, and what their
 * ranges are, is Live's own answer — a mock can only assert whatever we already
 * believed. Glue Compressor covers every case on one device: Threshold and
 * Dry/Wet report a unit; Attack and Release display a bare number and have
 * their units recorded (in milliseconds and seconds respectively); S/C EQ Q
 * displays a bare number that measures nothing.
 *
 * Run with: npm run e2e:mcp -- device/update/ppal-update-device-param-units
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  parseToolResult,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-update-device param units", () => {
  describe("a param that reports its own unit", () => {
    it("writes a value in that unit", async () => {
      const deviceId = await glueCompressor();
      const { data, warnings } = await write(deviceId, "Threshold", "-20 dB");

      expect(warnings).toStrictEqual([]);
      expect(data.params).toStrictEqual([
        { id: expect.any(String), name: "Threshold", value: -20 },
      ]);
    });

    it("refuses a value in a unit the param doesn't use", async () => {
      const deviceId = await glueCompressor();
      // Dry/Wet is a percentage. The number alone is in range, so before the
      // unit was checked this wrote 50% and reported success.
      const { data, warnings } = await write(deviceId, "Dry/Wet", "50 dB");

      expect(data.params).toBeUndefined();
      expect(warnings).toStrictEqual([
        expect.stringContaining('is measured in %, so "50 dB" was not written'),
      ]);
    });
  });

  describe("a param whose unit is recorded", () => {
    it("reports the recorded unit on a read", async () => {
      const deviceId = await glueCompressor();

      expect(await readUnit(deviceId, "Attack")).toBe("ms");
      expect(await readUnit(deviceId, "Release")).toBe("s");
    });

    // Attack takes milliseconds, and this spelling is the one models reach for.
    it("writes a value in the recorded unit", async () => {
      const deviceId = await glueCompressor();
      const { data, warnings } = await write(deviceId, "Attack", "10 ms");

      expect(warnings).toStrictEqual([]);
      expect(data.params).toStrictEqual([
        { id: expect.any(String), name: "Attack", value: 10 },
      ]);
    });

    // Release displays seconds, but parseLabel folds seconds into milliseconds.
    // Every spelling of the same duration has to come back to the same step, or
    // the value was not put back on the param's own scale. "0.5 s" used to be
    // read as 500, land past the 1.2 maximum, and clamp there.
    it("lands the same duration however it is spelled", async () => {
      const deviceId = await glueCompressor();
      const bare = await writeValue(deviceId, "Release", "0.5");
      const seconds = await writeValue(deviceId, "Release", "0.5 s");
      const millis = await writeValue(deviceId, "Release", "500 ms");

      expect(typeof bare).toBe("number");
      expect(seconds).toBe(bare);
      expect(millis).toBe(bare);
    });

    it("still refuses a unit measuring something else", async () => {
      const deviceId = await glueCompressor();
      const { data, warnings } = await write(deviceId, "Release", "50 %");

      expect(data.params).toBeUndefined();
      expect(warnings).toStrictEqual([
        expect.stringContaining('is measured in s, so "50 %" was not written'),
      ]);
    });
  });

  // These labels were unreadable until the parser learned them, so every param
  // wearing one looked like a bare number and refused any unit.
  describe("a pitch unit read off the label", () => {
    it("reports cents, and writes them", async () => {
      const deviceId = await createTestDevice(ctx.client!, "Corpus", "t0");

      expect(await readUnit(deviceId, "Fine")).toBe("cents");

      const { data, warnings } = await write(deviceId, "Fine", "20 ct");

      expect(warnings).toStrictEqual([]);
      expect(data.params).toStrictEqual([
        { id: expect.any(String), name: "Fine", value: 20 },
      ]);
    });

    it("reports semitones on a param whose label carries a decimal", async () => {
      const deviceId = await createTestDevice(
        ctx.client!,
        "Spectral Resonator",
        "t0",
      );

      expect(await readUnit(deviceId, "Shift")).toBe("semitones");

      const { data, warnings } = await write(deviceId, "Shift", "2.5 st");

      expect(warnings).toStrictEqual([]);
      expect(data.params).toStrictEqual([
        {
          id: expect.any(String),
          name: "Shift",
          value: expect.closeTo(2.5, 1),
        },
      ]);
    });
  });

  describe("a param that measures nothing", () => {
    // S/C EQ Q is a Q factor: a bare number with no unit recorded, because
    // there is no unit to record.
    it("refuses a unit, since there is none to check against", async () => {
      const deviceId = await glueCompressor();
      const { data, warnings } = await write(deviceId, "S/C EQ Q", "5 dB");

      expect(data.params).toBeUndefined();
      expect(warnings).toStrictEqual([
        expect.stringContaining("never says what it measures"),
      ]);
    });

    it("writes that same param when the unit is left off", async () => {
      const deviceId = await glueCompressor();
      const { data, warnings } = await write(deviceId, "S/C EQ Q", "5");

      expect(warnings).toStrictEqual([]);
      expect(data.params).toStrictEqual([
        { id: expect.any(String), name: "S/C EQ Q", value: expect.any(Number) },
      ]);
    });
  });
});

/**
 * Create a Glue Compressor on the first track.
 * @returns The new device's id
 */
function glueCompressor(): Promise<string> {
  return createTestDevice(ctx.client!, "Glue Compressor", "t0");
}

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

/**
 * Write one param value and return the value it landed on.
 * @param deviceId - Device holding the parameter
 * @param name - Parameter to write
 * @param value - Value to request, unit and all
 * @returns The value the write landed on
 */
async function writeValue(
  deviceId: string,
  name: string,
  value: string,
): Promise<number | string | undefined> {
  const { data } = await write(deviceId, name, value);

  return data.params?.[0]?.value;
}

/**
 * Read the unit read-device reports for one param.
 * @param deviceId - Device holding the parameter
 * @param name - Parameter to read
 * @returns The reported unit, or undefined if it reports none
 */
async function readUnit(
  deviceId: string,
  name: string,
): Promise<string | undefined> {
  const result = parseToolResult<ReadDeviceResult>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: {
        id: deviceId,
        include: ["param-values"],
        paramSearch: name,
      },
    }),
  );

  return result.parameters?.find((p) => p.name === name)?.unit;
}

interface ReadDeviceResult {
  parameters?: Array<{ name: string; unit?: string }>;
}

interface UpdateDeviceResult {
  params?: Array<{ id: string; name: string; value?: number | string }>;
}
