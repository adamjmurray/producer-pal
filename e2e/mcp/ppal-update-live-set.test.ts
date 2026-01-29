/**
 * E2E tests for ppal-update-live-set tool
 * Automatically opens the basic-midi-4-track Live Set before each test.
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  extractToolResultText,
  parseCompactJSLiteral,
  setupMcpTestContext,
  sleep,
} from "./mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-update-live-set", () => {
  it("updates live set settings and verifies with read", async () => {
    // Store original values to restore later
    const initialRead = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["scenes"] },
    });
    const initial = parseCompactJSLiteral<ReadResult>(
      extractToolResultText(initialRead),
    );
    const originalTempo = initial.tempo;
    const originalTimeSig = initial.timeSignature;

    // Test 1: Update tempo
    const newTempo = originalTempo === 120 ? 130 : 120;
    const tempoUpdate = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { tempo: newTempo },
    });
    const tempoResult = parseCompactJSLiteral<UpdateResult>(
      extractToolResultText(tempoUpdate),
    );

    expect(tempoResult.tempo).toBe(newTempo);

    // Verify with read
    const afterTempo = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const afterTempoRead = parseCompactJSLiteral<ReadResult>(
      extractToolResultText(afterTempo),
    );

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
    const timeSigResult = parseCompactJSLiteral<UpdateResult>(
      extractToolResultText(timeSigUpdate),
    );

    expect(timeSigResult.timeSignature).toBe(newTimeSig);

    // Wait for Live API state to settle, then verify with read
    await sleep(100);
    const afterTimeSig = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const afterTimeSigRead = parseCompactJSLiteral<ReadResult>(
      extractToolResultText(afterTimeSig),
    );

    expect(afterTimeSigRead.timeSignature).toBe(newTimeSig);

    // Restore original time signature
    await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { timeSignature: originalTimeSig },
    });

    // Test 3: Set scale
    const scaleUpdate = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { scale: "D Minor" },
    });
    const scaleResult = parseCompactJSLiteral<UpdateResult>(
      extractToolResultText(scaleUpdate),
    );

    expect(scaleResult.scale).toBe("D Minor");
    expect(scaleResult.scalePitches).toBeDefined();
    expect(Array.isArray(scaleResult.scalePitches)).toBe(true);

    // Verify scale is set (read doesn't include scale unless scale_mode is enabled)
    // The update response includes the scale info

    // Test 4: Disable scale (empty string)
    const disableScale = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: { scale: "" },
    });
    const disableResult = parseCompactJSLiteral<UpdateResult>(
      extractToolResultText(disableScale),
    );

    expect(disableResult.scale).toBe(""); // Empty string means scale disabled

    // Test 5: Update multiple parameters at once
    const multiUpdate = await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: {
        tempo: 140,
        timeSignature: "6/8",
        scale: "G Major",
      },
    });
    const multiResult = parseCompactJSLiteral<UpdateResult>(
      extractToolResultText(multiUpdate),
    );

    expect(multiResult.tempo).toBe(140);
    expect(multiResult.timeSignature).toBe("6/8");
    expect(multiResult.scale).toBe("G Major");

    // Wait for Live API state to settle, then verify all with read
    await sleep(100);
    const afterMulti = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const afterMultiRead = parseCompactJSLiteral<ReadResult>(
      extractToolResultText(afterMulti),
    );

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
