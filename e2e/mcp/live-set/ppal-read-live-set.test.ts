/**
 * E2E tests for ppal-read-live-set tool
 * Uses: e2e-test-set (12 tracks + 2 returns, 8 scenes)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import { parseToolResult, setupMcpTestContext } from "../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

describe("ppal-read-live-set", () => {
  it("reads basic live set info and tracks", async () => {
    // Test: Default call (no include param)
    const defaultResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const defaultParsed = parseToolResult<ReadLiveSetResult>(defaultResult);

    // Basic live set info
    expect(defaultParsed.id).toBeDefined();
    expect(defaultParsed.tempo).toBeGreaterThan(0);
    expect(defaultParsed.timeSignature).toMatch(/^\d+\/\d+$/);
    expect(typeof defaultParsed.sceneCount).toBe("number");
    expect(defaultParsed.sceneCount).toBeGreaterThanOrEqual(1);

    // Tracks included by default (12 regular tracks in e2e-test-set)
    expect(Array.isArray(defaultParsed.tracks)).toBe(true);
    expect(defaultParsed.tracks?.length).toBe(12);

    // Verify track structure
    const firstTrack = defaultParsed.tracks?.[0];

    expect(firstTrack?.id).toBeDefined();
    expect(typeof firstTrack?.name).toBe("string");
    expect(["midi", "audio"]).toContain(firstTrack?.type);
    expect(typeof firstTrack?.trackIndex).toBe("number");

    // Instruments included by default (can be null for audio tracks)
    expect("instrument" in (firstTrack ?? {})).toBe(true);
  });

  it("reads live set with scenes include", async () => {
    // Test: With scenes include
    const scenesResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["scenes"] },
    });
    const scenesParsed = parseToolResult<ReadLiveSetResult>(scenesResult);

    expect(Array.isArray(scenesParsed.scenes)).toBe(true);
    expect(scenesParsed.scenes?.length).toBeGreaterThanOrEqual(1);

    const firstScene = scenesParsed.scenes?.[0];

    expect(firstScene?.id).toBeDefined();
    expect(typeof firstScene?.name).toBe("string");
    expect(typeof firstScene?.sceneIndex).toBe("number");
  });

  it("reads return tracks and locators", async () => {
    // Test 1: With return-tracks include
    const returnResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["return-tracks"] },
    });
    const returnParsed = parseToolResult<ReadLiveSetResult>(returnResult);

    // Return tracks: 2 in e2e-test-set (A-Delay, B-Reverb)
    expect(Array.isArray(returnParsed.returnTracks)).toBe(true);
    expect(returnParsed.returnTracks?.length).toBe(2);

    // Test 2: With locators include
    const locatorsResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["locators"] },
    });
    const locatorsParsed = parseToolResult<ReadLiveSetResult>(locatorsResult);

    // 4 locators in e2e-test-set: Intro@1|1, Verse@9|1, Chorus@17|1, Bridge@33|1
    expect(Array.isArray(locatorsParsed.locators)).toBe(true);
    expect(locatorsParsed.locators?.length).toBe(4);
    expect(locatorsParsed.locators?.[0]?.name).toBe("Intro");
    expect(locatorsParsed.locators?.[0]?.time).toBe("1|1");
    expect(locatorsParsed.locators?.[1]?.name).toBe("Verse");
    expect(locatorsParsed.locators?.[1]?.time).toBe("9|1");
  });
});

/**
 * Type for ppal-read-live-set result
 */
interface ReadLiveSetResult {
  id: string;
  name?: string;
  tempo: number;
  timeSignature: string;
  sceneCount?: number;
  scenes?: Array<{ id: string; name: string; sceneIndex: number }>;
  tracks?: Array<{
    id: string;
    name: string;
    type: "midi" | "audio";
    trackIndex: number;
    instrument?: { id: string; name: string } | null;
  }>;
  returnTracks?: Array<{ id: string; name: string; trackIndex: number }>;
  locators?: Array<{ id: string; name: string; time: string }>;
}
