// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for how a `param-values` read says option lists: an Off/On toggle
 * lists no options (its value says them, and a write takes On/Off or
 * true/false), and a list two or more params share is said once in the
 * device's `optionLists`, which those params name with `optionList`.
 *
 * Run with: npm run e2e:mcp -- device/params/ppal-device-compact-param-values
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  parseToolResult,
  setupMcpTestContext,
} from "../../mcp-test-helpers.ts";
import { readParam } from "../helpers/device-param-test-helpers.ts";

const ctx = setupMcpTestContext();

interface CompactParam {
  name: string;
  value?: number | string;
  options?: unknown[];
  optionList?: string;
}

interface CompactRead {
  optionLists?: Record<string, unknown[]>;
  parameters: CompactParam[];
}

/**
 * Read every param of a device with its values.
 * @param deviceId - Device to read
 * @returns The read
 */
async function readValues(deviceId: string): Promise<CompactRead> {
  return parseToolResult<CompactRead>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { id: deviceId, include: ["param-values"] },
    }),
  );
}

describe("an Off/On toggle in a param-values read", () => {
  it("lists no options, and takes On/Off and true/false when written", async () => {
    const deviceId = await createTestDevice(ctx.client!, "Operator", "t8");
    const { parameters } = await readValues(deviceId);
    const toggle = parameters.find((p) => p.name === "Glide On");

    expect(toggle?.value).toMatch(/^(On|Off)$/);
    expect(toggle).not.toHaveProperty("options");
    expect(toggle).not.toHaveProperty("optionList");

    for (const [sent, read] of [
      ["On", "On"],
      [false, "Off"],
      [true, "On"],
      ["Off", "Off"],
    ] as const) {
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: {
          id: deviceId,
          params: [{ name: "Glide On", value: sent }],
        },
      });

      expect((await readParam(ctx.client!, deviceId, "Glide On")).value).toBe(
        read,
      );
    }
  });

  it("leaves a longer list that starts with Off on its param", async () => {
    const deviceId = await createTestDevice(ctx.client!, "Operator", "t8");
    const { optionLists, parameters } = await readValues(deviceId);
    const dest = parameters.find((p) => p.name === "LFO Dst B");
    const list = dest?.options ?? optionLists?.[dest?.optionList ?? ""];

    expect(list?.[0]).toBe("Off");
    expect(list?.length).toBeGreaterThan(2);
  });
});

describe("a list shared by several params in a param-values read", () => {
  it("is said once, and each param names it", async () => {
    const deviceId = await createTestDevice(ctx.client!, "EQ Eight", "t2");
    const { optionLists, parameters } = await readValues(deviceId);
    const types = parameters.filter((p) =>
      /^\d Filter Type [AB]$/.test(p.name),
    );

    expect(types).toHaveLength(16);
    expect(new Set(types.map((p) => p.optionList)).size).toBe(1);
    expect(types.some((p) => "options" in p)).toBe(false);

    const list = optionLists?.[types[0]!.optionList!];

    expect(list).toContain("Bell");
    expect(list).toContain("Notch");
    expect(Object.keys(optionLists ?? {})).toHaveLength(1);
  });

  it("takes any option of the shared list when written", async () => {
    const deviceId = await createTestDevice(ctx.client!, "EQ Eight", "t2");

    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: {
        id: deviceId,
        params: [{ name: "3 Filter Type A", value: "Notch" }],
      },
    });

    const param = await readParam(ctx.client!, deviceId, "3 Filter Type A");

    expect(param.value).toBe("Notch");
    expect(param.options).toContain("Bell");
  });
});
