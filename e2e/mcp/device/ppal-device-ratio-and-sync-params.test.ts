// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for params whose label carries more than a plain number: ratios
 * ("1 : 2.00") and sync ladders ("1 / 16", "8".."1/64").
 *
 * These all used to report a range of 1..1, and a write of the only value the
 * read advertised moved the param somewhere else and reported success. Which
 * shape Live prints is Live's own answer, so a mock can only assert what we
 * already believed — the labels here come from real Live.
 *
 * See dev/Device-Param-Labels.md.
 *
 * Run with: npm run e2e:mcp -- device/ppal-device-ratio-and-sync-params
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  parseToolResult,
  setupMcpTestContext,
} from "../mcp-test-helpers";

interface ParamInfo {
  name: string;
  value?: number | string;
  min?: number;
  max?: number;
  options?: string[];
  alsoAccepts?: string;
}

const ctx = setupMcpTestContext();

/**
 * Read one parameter off a device by name.
 * @param deviceId - Device to read
 * @param name - Parameter name
 * @returns The parameter as ppal-read-device reports it
 */
async function readParam(deviceId: string, name: string): Promise<ParamInfo> {
  const device = parseToolResult<{ parameters?: ParamInfo[] }>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: {
        id: deviceId,
        include: ["params", "param-values"],
        paramSearch: name,
      },
    }),
  );
  const found = (device.parameters ?? []).find((param) => param.name === name);

  expect(found, `no parameter named "${name}"`).toBeDefined();

  return found as ParamInfo;
}

/**
 * Write one parameter and read back what it landed on.
 * @param deviceId - Device to write
 * @param name - Parameter name
 * @param value - Value to write, in the param's display units
 * @returns The parameter's value after the write
 */
async function writeParam(
  deviceId: string,
  name: string,
  value: string,
): Promise<number | string | undefined> {
  await ctx.client!.callTool({
    name: "ppal-update-device",
    arguments: { id: deviceId, params: [{ name, value }] },
  });

  return (await readParam(deviceId, name)).value;
}

describe("a param whose label is a ratio", () => {
  it("reads the side of the ratio that varies, not the constant 1", async () => {
    const deviceId = await createTestDevice(ctx.client!, "Compressor", "t2");

    // Expansion Ratio reads "1 : 1.00" to "1 : 2.00". Reading the leading
    // number off both ends would report 1..1 and leave a write nothing to
    // aim at.
    expect(await readParam(deviceId, "Expansion Ratio")).toStrictEqual(
      expect.objectContaining({ min: 1, max: 2 }),
    );
  });

  it("lands a write on the value asked for", async () => {
    const deviceId = await createTestDevice(ctx.client!, "Compressor", "t2");

    expect(await writeParam(deviceId, "Expansion Ratio", "1.5")).toBe(1.5);
  });

  it("reads a ratio that counts down as the raw value rises", async () => {
    const deviceId = await createTestDevice(
      ctx.client!,
      "Multiband Dynamics",
      "t2",
    );

    // "1 : Inf" at the bottom down to "1 : 0.50" at the top, so max < min.
    expect(await readParam(deviceId, "Above Ratio (Low)")).toStrictEqual(
      expect.objectContaining({ max: 0.5, alsoAccepts: "1 : Inf" }),
    );
  });

  it("lands a write on a descending ratio", async () => {
    const deviceId = await createTestDevice(
      ctx.client!,
      "Multiband Dynamics",
      "t2",
    );

    expect(await writeParam(deviceId, "Above Ratio (Low)", "2")).toBe(2);
  });
});

describe("a param whose label is a sync division", () => {
  it("reads a spaced fraction as a division, not a number line", async () => {
    const deviceId = await createTestDevice(ctx.client!, "Auto Filter", "t2");
    const param = await readParam(deviceId, "LFO S&H");

    // Live spaces this one "1 / 16" and Auto Filter's own LFO Rate "1/16".
    expect(param.options).toContain("1 / 16");
    expect(param).toStrictEqual(
      expect.not.objectContaining({ min: expect.anything() }),
    );
  });

  it("takes a fraction written without the spaces Live prints", async () => {
    const deviceId = await createTestDevice(ctx.client!, "Auto Filter", "t2");

    expect(await writeParam(deviceId, "LFO S&H", "1/32")).toBe("1 / 32");
  });

  it("reads a ladder that only turns into fractions at its far end", async () => {
    const deviceId = await createTestDevice(ctx.client!, "Auto Filter", "t2");
    const param = await readParam(deviceId, "LFO Rate");

    // Bar counts at the bottom, fractions at the top. The current value and
    // the minimum are both bare numbers, so only the max end names a fraction.
    expect(param.options?.at(0)).toBe("8");
    expect(param.options?.at(-1)).toBe("1/64");
  });

  it("reaches a rung in the middle of the ladder", async () => {
    const deviceId = await createTestDevice(ctx.client!, "Auto Filter", "t2");

    expect(await writeParam(deviceId, "LFO Rate", "1/4")).toBe("1/4");
    expect(await writeParam(deviceId, "LFO Rate", "4")).toBe("4");
  });
});
