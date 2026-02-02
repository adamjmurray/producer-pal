/**
 * E2E tests for ppal-update-live-set tool
 * Automatically opens the basic-midi-4-track Live Set before each test.
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-update-live-set", () => {
  it("updates tempo and time signature", async () => {
    // Store original values to restore later
    const initialRead = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const initial = parseToolResult<ReadResult>(initialRead);
    const originalTempo = initial.tempo;
    const originalTimeSig = initial.timeSignature;

    // Test 1: Update tempo
    const newTempo = originalTempo === 120 ? 130 : 120;
    const tempoUpdate = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { tempo: newTempo },
    });
    const tempoResult = parseToolResult<UpdateResult>(tempoUpdate);

    expect(tempoResult.tempo).toBe(newTempo);

    // Verify with read
    const afterTempo = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const afterTempoRead = parseToolResult<ReadResult>(afterTempo);

    expect(afterTempoRead.tempo).toBe(newTempo);

    // Restore original tempo
    await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { tempo: originalTempo },
    });

    // Test 2: Update time signature
    const newTimeSig = originalTimeSig === "4/4" ? "3/4" : "4/4";
    const timeSigUpdate = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { timeSignature: newTimeSig },
    });
    const timeSigResult = parseToolResult<UpdateResult>(timeSigUpdate);

    expect(timeSigResult.timeSignature).toBe(newTimeSig);

    // Wait for Live API state to settle, then verify with read
    await sleep(100);
    const afterTimeSig = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const afterTimeSigRead = parseToolResult<ReadResult>(afterTimeSig);

    expect(afterTimeSigRead.timeSignature).toBe(newTimeSig);

    // Restore original time signature
    await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { timeSignature: originalTimeSig },
    });
  });

  it("updates scale and multiple parameters", async () => {
    // Store original values to restore later
    const initialRead = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const initial = parseToolResult<ReadResult>(initialRead);
    const originalTempo = initial.tempo;
    const originalTimeSig = initial.timeSignature;

    // Test 1: Set scale
    const scaleUpdate = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { scale: "D Minor" },
    });
    const scaleResult = parseToolResult<UpdateResult>(scaleUpdate);

    expect(scaleResult.scale).toBe("D Minor");
    expect(scaleResult.scalePitches).toBeDefined();
    expect(Array.isArray(scaleResult.scalePitches)).toBe(true);

    // Test 2: Disable scale (empty string)
    const disableScale = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { scale: "" },
    });
    const disableResult = parseToolResult<UpdateResult>(disableScale);

    expect(disableResult.scale).toBe(""); // Empty string means scale disabled

    // Test 3: Update multiple parameters at once
    const multiUpdate = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: {
        tempo: 140,
        timeSignature: "6/8",
        scale: "G Major",
      },
    });
    const multiResult = parseToolResult<UpdateResult>(multiUpdate);

    expect(multiResult.tempo).toBe(140);
    expect(multiResult.timeSignature).toBe("6/8");
    expect(multiResult.scale).toBe("G Major");

    // Wait for Live API state to settle, then verify all with read
    await sleep(100);
    const afterMulti = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const afterMultiRead = parseToolResult<ReadResult>(afterMulti);

    expect(afterMultiRead.tempo).toBe(140);
    expect(afterMultiRead.timeSignature).toBe("6/8");
    expect(afterMultiRead.scale).toBe("G Major");

    // Restore original values
    await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: {
        tempo: originalTempo,
        timeSignature: originalTimeSig,
        scale: "",
      },
    });
  });
});

interface ReadResult {
  id: string;
  tempo: number;
  timeSignature: string;
  sceneCount?: number;
  scale?: string;
  scalePitches?: string;
}

interface UpdateResult {
  id: string;
  tempo?: number;
  timeSignature?: string;
  scale?: string;
  scalePitches?: string[];
}
