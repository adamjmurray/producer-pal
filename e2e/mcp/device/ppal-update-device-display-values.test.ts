// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for writing display values to non-linear device parameters.
 *
 * These need a real Live: the whole question is whether the raw value we search
 * for renders as the display value the user asked for, and only Live's own
 * str_for_value knows that. Mocks can model a curve, not the one Live uses.
 *
 * Run with: npm run e2e:mcp -- device/ppal-update-device-display-values
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-update-device display values", () => {
  it("writes every 0.1 dB step of Utility's Output exactly", async () => {
    const deviceId = await createTestDevice(ctx.client!, "Utility", "t0");

    // Every one of these read back a step low before the search rounded to the
    // nearest reachable step and aimed at the middle of it.
    for (const target of [-1.2, -0.9, -1.1, -2.3, -4.7, 0]) {
      expect(await writeThenRead(deviceId, "Output", target)).toBe(target);
    }
  });

  it("reaches a Saturator Drive step the search used to skip", async () => {
    const deviceId = await createSaturator();

    // 2.3 dB was unreachable at any requested value: the search converged into
    // the 2.2 or 2.4 bucket and nothing in between could be asked for.
    for (const target of [2.2, 2.3, 2.4]) {
      expect(await writeThenRead(deviceId, "Drive", target)).toBe(target);
    }
  });

  it("lands a between-steps Drive request on the nearer step", async () => {
    const deviceId = await createSaturator();

    // Live shows Drive in 0.1 dB steps, so 2.04 and 2.06 have no step of their
    // own. Each goes to the closer neighbor rather than always down.
    expect(await writeThenRead(deviceId, "Drive", 2.04)).toBe(2);
    expect(await writeThenRead(deviceId, "Drive", 2.06)).toBe(2.1);
  });
});

/**
 * Create a Saturator set to the hard-clipping mode from the bug report.
 * @returns The new device's id
 */
async function createSaturator(): Promise<string> {
  const deviceId = await createTestDevice(ctx.client!, "Saturator", "t0");

  await ctx.client!.callTool({
    name: "ppal-update-device",
    arguments: {
      id: deviceId,
      params: [
        { name: "Type", value: "Digital Clip" },
        { name: "Post Clip Mode", value: "Hard Clip" },
        { name: "Color On", value: "Off" },
      ],
    },
  });
  await sleep(100);

  return deviceId;
}

/**
 * Write a display value to a parameter and read back what Live shows. The write
 * reports what it landed on too, so this also holds the two in step — a caller
 * trusting the write response must never need a read to correct it.
 * @param deviceId - Device holding the parameter
 * @param paramName - Parameter to write
 * @param value - Display value to request
 * @returns The parameter's value after the write
 */
async function writeThenRead(
  deviceId: string,
  paramName: string,
  value: number,
): Promise<number | string | undefined> {
  const written = parseToolResult<UpdateDeviceResult>(
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: {
        id: deviceId,
        params: [{ name: paramName, value: `${value}` }],
      },
    }),
  );

  await sleep(100);

  const result = parseToolResult<ReadDeviceResult>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: {
        id: deviceId,
        include: ["param-values"],
        paramSearch: paramName,
      },
    }),
  );

  const readValue = result.parameters?.find((p) => p.name === paramName)?.value;

  expect(written.params).toStrictEqual([
    { id: expect.any(String), name: paramName, value: readValue },
  ]);

  return readValue;
}

interface ReadDeviceResult {
  parameters?: Array<{ name: string; value?: number | string }>;
}

interface UpdateDeviceResult {
  params?: Array<{ id: string; name: string; value?: number | string }>;
}
