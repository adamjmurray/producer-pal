// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E test for naming the same device param twice in one call.
 *
 * Run with: npm run e2e:mcp -- device/update/ppal-update-device-duplicate-param
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  parseToolResult,
  setupMcpTestContext,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext();

interface ParamInfo {
  id: string;
  name: string;
  value?: number;
}

interface ParamEntry {
  ok?: false;
  detail?: string;
}

interface DeviceRead {
  parameters: ParamInfo[];
}

/**
 * Read a Glue Compressor's Threshold param, id and value.
 * @param deviceId - Device to read
 * @returns The Threshold param
 */
async function readThreshold(deviceId: string): Promise<ParamInfo> {
  const device = parseToolResult<DeviceRead>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { id: deviceId, include: ["params", "param-values"] },
    }),
  );
  const threshold = device.parameters.find(
    (param) => param.name === "Threshold",
  );

  expect(threshold, "no Threshold param").toBeDefined();

  return threshold as ParamInfo;
}

/** How the first entry addresses Threshold. */
type FirstEntry = { name: string } | { id: string };

/**
 * Write Threshold twice in one call, naming it two ways.
 * @param deviceId - The device to write to
 * @param first - How the first entry addresses the param
 * @returns The call's param entries
 */
async function writeThresholdTwice(
  deviceId: string,
  first: FirstEntry,
): Promise<ParamEntry[]> {
  const result = parseToolResult<{ params: ParamEntry[] }>(
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: {
        id: deviceId,
        params: [
          { ...first, value: "-6 dB" },
          { name: "Threshold", value: "-12 dB" },
        ],
      },
    }),
  );

  return result.params;
}

describe("ppal-update-device with the same param named twice", () => {
  // An id and a name are different text, so only resolving both to the same
  // param catches those. An all-digit name also reaches the param by id.
  it.each<[string, (id: string) => FirstEntry]>([
    ["the same name in another case", () => ({ name: "threshold" })],
    ["its id, then its name", (id) => ({ id })],
    ["its id as a name, then its name", (id) => ({ name: id })],
  ])("writes only the last entry: %s", async (_label, firstEntry) => {
    const deviceId = await createTestDevice(
      ctx.client!,
      "Glue Compressor",
      "t0",
    );
    const { id } = await readThreshold(deviceId);
    const params = await writeThresholdTwice(deviceId, firstEntry(id));

    expect(params[0]).toStrictEqual(
      expect.objectContaining({
        ok: false,
        detail: 'set again by "Threshold" later in the list',
      }),
    );
    expect(params[1]).not.toHaveProperty("ok");
    expect((await readThreshold(deviceId)).value).toBeCloseTo(-12, 0);
  });
});
