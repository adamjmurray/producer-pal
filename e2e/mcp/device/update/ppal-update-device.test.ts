// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
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
  createTestDeviceAt,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  type SkippedTargetResult,
  sleep,
} from "../../mcp-test-helpers";
import {
  callForParams,
  expectSkipThenValue,
} from "../helpers/device-param-test-helpers.ts";

const ctx = setupMcpTestContext();

/**
 * An Audio Effect Rack on track 0, wrapped around one device.
 * @returns The rack's id
 */
async function rackWithOneChain(): Promise<string> {
  const deviceId = await createTestDevice(ctx.client!, "Compressor", "t0");
  const wrapped = parseToolResult<WrapResult>(
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: deviceId, wrapInRack: true },
    }),
  );

  await sleep(150);

  return wrapped.id;
}

/**
 * Read a rack's macros and variations back from Live, once it has settled.
 * @param rackId - The rack's id
 * @returns The rack
 */
async function readRackParams(rackId: string): Promise<ReadDeviceResult> {
  await sleep(150);

  return parseToolResult<ReadDeviceResult>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { id: rackId, include: ["params"] },
    }),
  );
}

describe("ppal-update-device", () => {
  it("updates device name and collapsed state", async () => {
    // Setup: Create a Compressor on track 0
    const deviceId = await createTestDevice(ctx.client!, "Compressor", "t0");

    // Test 1: Update device name
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: deviceId, name: "My Compressor" },
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
      arguments: { id: deviceId, collapsed: true },
    });

    // Test 3: Update collapsed state to false (restore)
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: deviceId, collapsed: false },
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
        id: deviceId,
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

  // A params list that came back a name short leaves the caller diffing its
  // own request to work out which entry vanished.
  it("reports a param name that matched nothing, beside one that landed", async () => {
    const deviceId = await createTestDevice(ctx.client!, "Compressor", "t0");
    const updated = await callForParams(ctx.client!, "ppal-update-device", {
      id: deviceId,
      params: [
        { name: "Nope", value: "1" },
        { name: "Ratio", value: "4" },
      ],
    });

    expectSkipThenValue(updated, "Nope", { name: "Ratio" });
  });

  it("updates multiple devices in batch", async () => {
    // Setup: Create two devices on track 0
    const deviceId = await createTestDevice(ctx.client!, "Compressor", "t0");
    const deviceId2 = await createTestDevice(ctx.client!, "EQ Eight", "t0");

    // Test 1: Update multiple via comma-separated IDs
    const batchResult = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: `${deviceId}, ${deviceId2}`, name: "Batch Renamed" },
    });
    const batch = parseToolResult<UpdateDeviceResult[]>(batchResult);

    expect(Array.isArray(batch)).toBe(true);
    expect(batch).toHaveLength(2);

    // Test 2: the only target named isn't there, so the call is refused
    const nonExistentResult = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: "99999", name: "Won't Work" },
    });

    expect(isToolError(nonExistentResult)).toBe(true);
    expect(getToolErrorMessage(nonExistentResult)).toContain(
      'id "99999" does not exist',
    );
  });

  /**
   * Update every target named and parse the entries, which must not warn: a
   * target's own entry is where anything about it belongs.
   * @param args - ppal-update-device arguments
   * @returns One entry per target named
   */
  async function updateTargets(
    args: Record<string, unknown>,
  ): Promise<Array<UpdateDeviceResult | SkippedTargetResult>> {
    return parseToolResult<Array<UpdateDeviceResult | SkippedTargetResult>>(
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: args,
      }),
    );
  }

  // Every target named gets an entry, in order, so a paired name list can't
  // slide onto the wrong device when one of them is missing.
  it("keeps a slot for a device it couldn't reach, and warns nowhere", async () => {
    const deviceId = await createTestDevice(ctx.client!, "Compressor", "t0");
    const entries = await updateTargets({
      id: `${deviceId},99999`,
      name: "Reached,Nowhere",
    });

    expect(entries).toStrictEqual([
      expect.objectContaining({ id: deviceId }),
      { id: "99999", ok: false, reason: 'id "99999" does not exist' },
    ]);

    await sleep(100);
    const device = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { id: deviceId },
      }),
    );

    expect(device.name).toBe("Reached");
  });

  // A number pairs with the targets the way a name does, so one call can give
  // two chains different levels.
  it("gives each chain the gain and pan at its own position", async () => {
    const entries = await updateTargets({
      path: "t6/d0/c0,t6/d0/c1",
      gainDb: "-6,-12",
      pan: "-0.5,0.5",
    });

    expect(entries).toHaveLength(2);

    await sleep(100);
    const rack = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: "t6/d0", include: ["chains"] },
      }),
    );
    const chains = (rack.chains ?? []) as Array<{
      gainDb?: number;
      pan?: number;
    }>;

    expect(chains[0]?.gainDb).toBeCloseTo(-6, 1);
    expect(chains[1]?.gainDb).toBeCloseTo(-12, 1);
    expect(chains[0]?.pan).toBeCloseTo(-0.5, 1);
    expect(chains[1]?.pan).toBeCloseTo(0.5, 1);

    // Back to the defaults the Set holds, so the rest of the file sees the
    // chains it expects.
    await updateTargets({
      path: "t6/d0/c0,t6/d0/c1",
      gainDb: "0",
      pan: "0",
    });
  });

  it("refuses a number list that names the wrong number of targets", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: "t6/d0/c0,t6/d0/c1", gainDb: "-6,-12,-18" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "path names 2 entries but gainDb names 3 entries.",
    );
  });

  it("reports a path that names no device in its own slot", async () => {
    const deviceId = await createTestDevice(ctx.client!, "Compressor", "t0");
    // One name for both targets, so only the one it reaches is renamed.
    const entries = await updateTargets({
      id: deviceId,
      path: "t99/d99",
      name: "Reached By Id",
    });

    expect(entries).toStrictEqual([
      expect.objectContaining({ id: deviceId }),
      { path: "t99/d99", ok: false, reason: 'nothing at path "t99/d99"' },
    ]);
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
        arguments: { id: compressorId, wrapInRack: true },
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
      arguments: { id: rackId, macroCount: 4 },
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
      arguments: { id: rackId, macroVariation: "create" },
    });
    await sleep(100);
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: rackId, macroVariation: "create" },
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
        id: rackId,
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

  // The macro count comes back from Live's own `visible_macro_count`, after it
  // has rounded an odd count up to the next even one.
  it("rounds an odd macroCount up and says so on the rack's entry", async () => {
    const rackId = await rackWithOneChain();

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: rackId, macroCount: 1 },
    });

    // The count landed, just not the one asked for, so there is no `ok`.
    expect(parseToolResult<UpdateDeviceResult>(result).reason).toBe(
      "macroCount rounded from 1 to 2 (macros come in pairs)",
    );

    expect((await readRackParams(rackId)).macros?.count).toBe(2);
  });

  // The pair says nothing about any one device, so a reading it can't be given
  // is refused before any target is touched.
  it.each([
    [
      { macroVariationIndex: 0 },
      "macroVariationIndex requires macroVariation 'load' or 'delete'",
    ],
    [
      { macroVariation: "load" },
      "macroVariation 'load' requires macroVariationIndex",
    ],
    [
      { macroVariation: "create", macroVariationIndex: 0 },
      "macroVariationIndex does nothing for macroVariation 'create'",
    ],
  ])("refuses the contradictory macro variation args %o", async (args, why) => {
    const rackId = await rackWithOneChain();

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: rackId, ...args },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(why);

    // Nothing was written, so no variation was stored on the way to the error.
    expect((await readRackParams(rackId)).variations?.count ?? 0).toBe(0);
  });

  // The count comes back off Live's own `visible_macro_count`. This rack has no
  // mappings, so both writes land exactly and the entry says nothing.
  it("raises and lowers macroCount with nothing to report", async () => {
    const rackId = await rackWithOneChain();

    for (const macroCount of [8, 2]) {
      const written = parseToolResultWithWarnings<UpdateDeviceResult>(
        await ctx.client!.callTool({
          name: "ppal-update-device",
          arguments: { id: rackId, macroCount },
        }),
      );

      expect(written.data.reason).toBeUndefined();
      expect(written.warnings).toStrictEqual([]);
      expect((await readRackParams(rackId)).macros?.count).toBe(macroCount);
    }
  });

  // A reason names the object the way the tools publish it, never by Live's
  // class name.
  it("says a rack-only param is not applicable to a chain", async () => {
    const written = parseToolResultWithWarnings<UpdateDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: { path: "t6/d0/c0", name: "Chain One", macroCount: 4 },
      }),
    );

    // The name landed, so the refused param rides along as a reason.
    expect(written.data.reason).toBe("macroCount not applicable to a chain");
    expect(written.warnings).toStrictEqual([]);
  });

  it("names path, not id, when a path-only call's lists disagree", async () => {
    const pathA = await createTestDeviceAt(ctx.client!, "Compressor", "t0");
    const pathB = await createTestDeviceAt(ctx.client!, "Compressor", "t1");

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: `${pathA},${pathB}`, name: "A,B,C" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "path names 2 entries but name names 3 entries.",
    );
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
  reason?: string;
  params?: Array<{
    id?: string;
    name: string;
    value?: number | string;
    reason?: string;
  }>;
}

interface WrapResult {
  id: string;
  type: string;
  deviceCount: number;
}
