// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-read-device tool
 * Uses: e2e-test-set with pre-populated devices
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import { parseToolResult, setupMcpTestContext } from "../mcp-test-helpers";

// Use once: true since we're only reading pre-populated devices
const ctx = setupMcpTestContext({ once: true });

describe("ppal-read-device", () => {
  it("reads devices by path and includes parameters", async () => {
    // Test 1: Read Compressor on t3/d1 by path
    const byPathResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path: "t3/d1" },
    });
    const byPath = parseToolResult<ReadDeviceResult>(byPathResult);

    expect(byPath.id).toBeDefined();
    expect(byPath.type).toContain("Compressor");

    // Test 2: Read device by deviceId
    const byIdResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { deviceId: String(byPath.id) },
    });
    const byId = parseToolResult<ReadDeviceResult>(byIdResult);

    expect(String(byId.id)).toBe(String(byPath.id));

    // Test 3: Read with include: ["params"] - parameter names only
    const paramsResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path: "t3/d1", include: ["params"] },
    });
    const withParams = parseToolResult<ReadDeviceResult>(paramsResult);

    expect(withParams.parameters).toBeDefined();
    expect(Array.isArray(withParams.parameters)).toBe(true);
    expect(withParams.parameters!.length).toBeGreaterThan(0);
    expect(withParams.parameters![0]!.id).toBeDefined();
    expect(withParams.parameters![0]!.name).toBeDefined();

    // Test 4: Read with include: ["param-values"] - full parameter details
    const paramValuesResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path: "t3/d1", include: ["param-values"] },
    });
    const withParamValues =
      parseToolResult<ReadDeviceResult>(paramValuesResult);

    expect(withParamValues.parameters).toBeDefined();
    expect(withParamValues.parameters!.length).toBeGreaterThan(0);
    const paramWithValue = withParamValues.parameters!.find(
      (p) => p.value !== undefined,
    );

    expect(paramWithValue).toBeDefined();

    // Test 5: Read with paramSearch filter
    const searchResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: {
        path: "t3/d1",
        include: ["params"],
        paramSearch: "threshold",
      },
    });
    const searched = parseToolResult<ReadDeviceResult>(searchResult);

    expect(searched.parameters).toBeDefined();
    const allMatchThreshold = searched.parameters!.every((p) =>
      p.name.toLowerCase().includes("threshold"),
    );

    expect(allMatchThreshold).toBe(true);
  });

  it("reads rack devices with chains", async () => {
    // Test 1: Read Instrument Rack with chains (t1/d0 "Layered Bass")
    const rackResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path: "t1/d0", include: ["chains"] },
    });
    const rack = parseToolResult<ReadDeviceResult>(rackResult);

    expect(rack.type).toBe("instrument-rack");
    expect(rack.chains).toBeDefined();
    expect(rack.chains!.length).toBe(2); // Sub Dirt Bass, Wavetable

    // Test 2: Read device inside a chain (t1/d0/c0/d0 - Operator in Sub Dirt Bass chain)
    const chainDeviceResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path: "t1/d0/c0/d0" },
    });
    const chainDevice = parseToolResult<ReadDeviceResult>(chainDeviceResult);

    expect(chainDevice.id).toBeDefined();
    expect(chainDevice.type).toContain("Operator");

    // Test 3: Read MIDI Effect Rack with chains (t2/d0)
    const midiRackResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path: "t2/d0", include: ["chains"] },
    });
    const midiRack = parseToolResult<ReadDeviceResult>(midiRackResult);

    expect(midiRack.type).toBe("midi-effect-rack");
    expect(midiRack.chains!.length).toBe(2); // Arpeggiator, Pitch

    // Test 4: Read Audio Effect Rack (t6/d0)
    const audioRackResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path: "t6/d0", include: ["chains"] },
    });
    const audioRack = parseToolResult<ReadDeviceResult>(audioRackResult);

    expect(audioRack.type).toBe("audio-effect-rack");
    expect(audioRack.chains!.length).toBe(2); // Dry, Reverb
  });

  it("reads Drum Rack with pads and return chains", async () => {
    // Test 1: Read Drum Rack with drum pads (t0/d0 "505 Classic Kit")
    const drumRackResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path: "t0/d0", include: ["drum-pads"] },
    });
    const drumRack = parseToolResult<ReadDeviceResult>(drumRackResult);

    expect(drumRack.type).toBe("drum-rack");
    expect(drumRack.drumPads).toBeDefined();
    expect(drumRack.drumPads!.length).toBeGreaterThanOrEqual(4); // C1, D1, Eb1, Gb1

    // Test 2: Read drum pad by path (t0/d0/pC1 - Kick)
    const padResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path: "t0/d0/pC1" },
    });
    const pad = parseToolResult<ReadDeviceResult>(padResult);

    expect(pad.id).toBeDefined();
    expect(pad.name).toContain("Kick");

    // Test 3: Read return chain (t0/d0/rc0 - Saturator)
    const returnChainResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path: "t0/d0/rc0", include: ["chains"] },
    });
    const returnChain = parseToolResult<ReadDeviceResult>(returnChainResult);

    expect(returnChain.id).toBeDefined();
  });

  it("reads nested racks with deep paths", async () => {
    // Test nested Instrument Rack (t7/d0 contains nested rack structure)
    // Path: t7/d0/c0/d0/c0/d0 should reach the Drift at the deepest level
    const nestedResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path: "t7/d0/c0/d0/c0/d0" },
    });
    const nested = parseToolResult<ReadDeviceResult>(nestedResult);

    expect(nested.id).toBeDefined();
    expect(nested.type).toContain("Drift");
  });

  it("reads rack macros and deactivated state", async () => {
    // Test macros: t1/d0 "Layered Bass" has 1 mapped macro
    const macroResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path: "t1/d0" },
    });
    const macroRack = parseToolResult<ReadDeviceResult>(macroResult);

    expect(macroRack.macros).toBeDefined();
    expect(macroRack.macros!.hasMappings).toBe(true);

    // Test deactivated: t7/d0 entire chain is deactivated
    const deactivatedResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path: "t7/d0" },
    });
    const deactivatedDevice =
      parseToolResult<ReadDeviceResult>(deactivatedResult);

    expect(deactivatedDevice.deactivated).toBe(true);
  });
});

interface ReadDeviceResult {
  id: string | number | null;
  type?: string;
  name?: string;
  collapsed?: boolean;
  deactivated?: boolean;
  macros?: { count: number; hasMappings: boolean };
  parameters?: Array<{
    id: string;
    name: string;
    value?: number | string;
    min?: number;
    max?: number;
  }>;
  chains?: Array<{
    id: string;
    name: string;
  }>;
  drumPads?: Array<{
    id: string;
    name: string;
    note: string;
  }>;
}
