// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E test for a param name that is not unique within a device. Corpus is the
 * only stock device with one — it has two params called `Width`, a filter
 * bandwidth and a stereo width — so only real Live can show the write hitting
 * both.
 *
 * See dev/Device-Param-Labels.md.
 *
 * Run with: npm run e2e:mcp -- device/ppal-device-duplicate-param-name
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  getToolWarnings,
  parseToolResult,
  setupMcpTestContext,
} from "../mcp-test-helpers";

interface ParamInfo {
  id: string;
  name: string;
  value?: number | string;
  min?: number;
  max?: number;
}

const ctx = setupMcpTestContext();

/**
 * Read every param on a device named "Width".
 * @param deviceId - Device to read
 * @returns The matching params
 */
async function readWidths(deviceId: string): Promise<ParamInfo[]> {
  const device = parseToolResult<{ parameters?: ParamInfo[] }>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { id: deviceId, include: ["params", "param-values"] },
    }),
  );

  return (device.parameters ?? []).filter((param) => param.name === "Width");
}

describe("a device with two params of the same name", () => {
  it("skips the write and names both ids", async () => {
    const deviceId = await createTestDevice(ctx.client!, "Corpus", "t2");
    const before = await readWidths(deviceId);

    expect(before).toHaveLength(2);

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: deviceId, params: [{ name: "Width", value: "50" }] },
    });
    const warning = getToolWarnings(result).find((text) =>
      text.includes('param "Width" names 2 params'),
    );

    expect(warning, "no ambiguous-name warning").toBeDefined();

    for (const param of before) {
      expect(warning).toContain(`id ${param.id}`);
    }

    // Neither param moved: the old behavior wrote the first match, clamping 50
    // into the bandwidth's 0.5-9 range.
    expect(await readWidths(deviceId)).toStrictEqual(before);
  });

  it("writes the one the caller means when addressed by id", async () => {
    const deviceId = await createTestDevice(ctx.client!, "Corpus", "t2");
    const stereo = (await readWidths(deviceId)).find(
      (param) => param.max === 100,
    );

    expect(stereo, "no percentage Width").toBeDefined();

    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: deviceId, params: [{ name: stereo!.id, value: "50" }] },
    });

    const after = (await readWidths(deviceId)).find(
      (param) => param.id === stereo!.id,
    );

    expect(after?.value).toBe(50);
  });
});
