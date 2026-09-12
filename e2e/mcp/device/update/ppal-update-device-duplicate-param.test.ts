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

interface DeviceRead {
  parameters: { name: string; value: unknown }[];
}

describe("ppal-update-device with the same param named twice", () => {
  it("is refused before any write lands", async () => {
    const deviceId = await createTestDevice(
      ctx.client!,
      "Glue Compressor",
      "t0",
    );

    const readThreshold = async (): Promise<unknown> => {
      const device = parseToolResult<DeviceRead>(
        await ctx.client!.callTool({
          name: "ppal-read-device",
          arguments: { id: deviceId, include: ["params"] },
        }),
      );

      return device.parameters.find((p) => p.name === "Threshold")?.value;
    };

    const before = await readThreshold();

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
    expect(await readThreshold()).toBe(before);
  });
});
