// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-update-device tool
 * Updates device properties - these modifications persist within the session.
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  parseToolResult,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-update-device", () => {
  it("updates device name and collapsed state", async () => {
    // Setup: Create a Compressor on track 0
    const deviceId = await createTestDevice(ctx.client!, "Compressor", "t0");

    // Test 1: Update device name
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { ids: deviceId, name: "My Compressor" },
    });

    await sleep(100);
    const afterName = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { id: deviceId },
    });
    const namedDevice = parseToolResult<ReadDeviceResult>(afterName);

    expect(namedDevice.name).toBe("My Compressor");

    // Test 2: Update collapsed state (collapsed is not returned by read-device,
    // so we just verify the update calls succeed without error)
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { ids: deviceId, collapsed: true },
    });

    // Test 3: Update collapsed state to false (restore)
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { ids: deviceId, collapsed: false },
    });
  });

  it("updates device parameters", async () => {
    // Setup: Create a Compressor on track 0
    const deviceId = await createTestDevice(ctx.client!, "Compressor", "t0");

    // Test 1: Get params and update a numeric param value
    const paramsResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: {
        id: deviceId,
        include: ["param-values"],
        paramSearch: "ratio",
      },
    });
    const deviceWithParams = parseToolResult<ReadDeviceResult>(paramsResult);

    expect(deviceWithParams.parameters).toBeDefined();

    const ratioParam = deviceWithParams.parameters?.find((p) =>
      p.name.toLowerCase().includes("ratio"),
    );

    expect(ratioParam).toBeDefined();

    // Update the ratio parameter by name
    const newRatio = 4;

    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: {
        ids: deviceId,
        params: [{ name: ratioParam!.name, value: String(newRatio) }],
      },
    });

    await sleep(100);
    const afterParam = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: {
        id: deviceId,
        include: ["param-values"],
        paramSearch: "ratio",
      },
    });
    const updatedDevice = parseToolResult<ReadDeviceResult>(afterParam);
    const updatedRatio = updatedDevice.parameters?.find((p) =>
      p.name.toLowerCase().includes("ratio"),
    );

    expect(updatedRatio?.value).toBe(newRatio);

    // Test 2: Update device by path instead of ID
    // Note: Single device updates return an unwrapped object, not an array
    const byPathResult = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: "t0/d0", name: "Path Updated" },
    });
    const byPath = parseToolResult<UpdateDeviceResult | UpdateDeviceResult[]>(
      byPathResult,
    );

    // Result may be single object (unwrapped) or array depending on count
    const byPathArray = Array.isArray(byPath) ? byPath : [byPath];

    expect(byPathArray.length).toBeGreaterThan(0);
    expect(byPathArray[0]!.id).toBeDefined();
  });

  it("updates multiple devices in batch", async () => {
    // Setup: Create two devices on track 0
    const deviceId = await createTestDevice(ctx.client!, "Compressor", "t0");
    const deviceId2 = await createTestDevice(ctx.client!, "EQ Eight", "t0");

    // Test 1: Update multiple via comma-separated IDs
    const batchResult = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { ids: `${deviceId}, ${deviceId2}`, name: "Batch Renamed" },
    });
    const batch = parseToolResult<UpdateDeviceResult[]>(batchResult);

    expect(Array.isArray(batch)).toBe(true);
    expect(batch).toHaveLength(2);

    // Test 2: Update non-existent device - should return empty with warning
    const nonExistentResult = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { ids: "99999", name: "Won't Work" },
    });
    const { data: nonExistent, warnings } =
      parseToolResultWithWarnings<UpdateDeviceResult[]>(nonExistentResult);

    // Should be empty array (device not found, no error thrown)
    expect(Array.isArray(nonExistent)).toBe(true);
    expect(nonExistent).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("target not found");
  });

  it("wraps a device in a rack and manages macros and variations", async () => {
    // Wrapping and rack variation/macro operations mutate real Live rack state
    // (variation_count, visible_macro_count) that mocked unit tests can't model.
    const compressorId = await createTestDevice(
      ctx.client!,
      "Compressor",
      "t0",
    );

    // Wrap the device in an auto-detected Audio Effect Rack
    const wrapResult = parseToolResult<WrapResult>(
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: { ids: compressorId, wrapInRack: true },
      }),
    );

    expect(wrapResult.id).toBeDefined();
    expect(wrapResult.deviceCount).toBe(1);

    const rackId = wrapResult.id;

    await sleep(100);

    // The rack should contain the wrapped device in a chain
    const rackRead = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { id: rackId, include: ["chains"], maxDepth: 1 },
      }),
    );

    expect(rackRead.chains?.length).toBeGreaterThan(0);

    // Set visible macro count (macros come in pairs)
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { ids: rackId, macroCount: 4 },
    });

    await sleep(100);
    const afterMacroCount = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { id: rackId, include: ["params"] },
      }),
    );

    expect(afterMacroCount.macros?.count).toBe(4);

    // Create two macro variations
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { ids: rackId, macroVariation: "create" },
    });
    await sleep(100);
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { ids: rackId, macroVariation: "create" },
    });
    await sleep(100);

    const afterCreate = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { id: rackId, include: ["params"] },
      }),
    );

    expect(afterCreate.variations?.count).toBe(2);

    // Delete the first variation
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: {
        ids: rackId,
        macroVariation: "delete",
        macroVariationIndex: 0,
      },
    });
    await sleep(100);

    const afterDelete = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { id: rackId, include: ["params"] },
      }),
    );

    expect(afterDelete.variations?.count).toBe(1);
  });
});

interface ReadDeviceResult {
  id: string;
  type?: string;
  name?: string;
  collapsed?: boolean;
  parameters?: Array<{
    id: string;
    name: string;
    value?: number | string;
  }>;
  chains?: unknown[];
  macros?: { count: number; hasMappings: boolean };
  variations?: { count: number; selected: number };
}

interface UpdateDeviceResult {
  id: string;
}

interface WrapResult {
  id: string;
  type: string;
  deviceCount: number;
}
