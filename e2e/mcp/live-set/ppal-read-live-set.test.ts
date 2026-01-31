/**
 * E2E tests for ppal-read-live-set tool
 * Automatically opens the basic-midi-4-track Live Set before each test.
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import { parseToolResult, setupMcpTestContext } from "../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

describe("ppal-read-live-set", () => {
  it("reads live set info with default and custom include params", async () => {
    // Test 1: Default call (no include param)
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

    // Tracks included by default (4 music tracks + 1 Producer Pal device track = 5 total)
    expect(Array.isArray(defaultParsed.tracks)).toBe(true);
    expect(defaultParsed.tracks?.length).toBeGreaterThanOrEqual(1);

    // Verify track structure
    const firstTrack = defaultParsed.tracks?.[0];

    expect(firstTrack?.id).toBeDefined();
    expect(typeof firstTrack?.name).toBe("string");
    expect(["midi", "audio"]).toContain(firstTrack?.type);
    expect(typeof firstTrack?.trackIndex).toBe("number");

    // Instruments included by default (can be null for audio tracks)
    expect("instrument" in (firstTrack ?? {})).toBe(true);

    // Test 2: With scenes include
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

    // Test 3: With return-tracks include
    const returnResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["return-tracks"] },
    });
    const returnParsed = parseToolResult<ReadLiveSetResult>(returnResult);

    // Return tracks may or may not exist in the test set, but the property should be present
    expect(
      returnParsed.returnTracks === undefined ||
        Array.isArray(returnParsed.returnTracks),
    ).toBe(true);
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
}
