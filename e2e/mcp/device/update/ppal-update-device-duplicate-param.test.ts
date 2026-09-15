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
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext();

interface ParamInfo {
  id: string;
  name: string;
  value?: unknown;
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

describe("ppal-update-device with the same param named twice", () => {
  it("is refused before any write lands", async () => {
    const deviceId = await createTestDevice(
      ctx.client!,
      "Glue Compressor",
      "t0",
    );
    const before = await readThreshold(deviceId);

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: {
        id: deviceId,
        params: [
          { name: "Threshold", value: "-6" },
          { name: "Threshold", value: "-12" },
        ],
      },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toMatch(/Threshold.*more than once/);
    expect((await readThreshold(deviceId)).value).toBe(before.value);
  });

  // The id and the name are different text, so only resolving both to the same
  // param catches this one. The refusal names both spellings.
  it("is refused when one entry is the id and the other the name", async () => {
    const deviceId = await createTestDevice(
      ctx.client!,
      "Glue Compressor",
      "t0",
    );
    const before = await readThreshold(deviceId);

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: {
        id: deviceId,
        params: [
          { name: before.id, value: "-6" },
          { name: "Threshold", value: "-12" },
        ],
      },
    });

    expect(isToolError(result)).toBe(true);

    const message = getToolErrorMessage(result);

    expect(message).toMatch(/more than once/);
    expect(message).toContain("Threshold");
    expect(message).toContain(before.id);
    expect((await readThreshold(deviceId)).value).toBe(before.value);
  });
});
