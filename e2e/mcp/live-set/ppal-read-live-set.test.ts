// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-read-live-set tool
 * Uses: e2e-test-set (12 tracks + 2 returns, 8 scenes)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

describe("ppal-read-live-set", () => {
  it("reads basic live set info and tracks", async () => {
    // Test 1: Default call (no include param) - returns counts, not arrays
    const defaultResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const defaultParsed = parseToolResult<ReadLiveSetResult>(defaultResult);

    // Basic live set info (id is not included by default)
    expect(defaultParsed.tempo).toBeGreaterThan(0);
    expect(defaultParsed.timeSignature).toMatch(/^\d+\/\d+$/);
    expect(typeof defaultParsed.sceneCount).toBe("number");
    expect(defaultParsed.sceneCount).toBeGreaterThanOrEqual(1);

    // Default returns counts, not track arrays
    expect(typeof defaultParsed.regularTrackCount).toBe("number");
    expect(defaultParsed.regularTrackCount).toBe(12);
    expect(defaultParsed.tracks).toBeUndefined();

    // Test 2: With include: ["tracks"] - returns full track array
    const tracksResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["tracks"] },
    });
    const tracksParsed = parseToolResult<ReadLiveSetResult>(tracksResult);

    expect(Array.isArray(tracksParsed.tracks)).toBe(true);
    expect(tracksParsed.tracks?.length).toBe(12);

    // Verify track structure
    const firstTrack = tracksParsed.tracks?.[0];

    expect(firstTrack?.id).toBeDefined();
    expect(typeof firstTrack?.name).toBe("string");
    expect(["midi", "audio"]).toContain(firstTrack?.type);
    expect(firstTrack?.path).toBe("t0");

    // Instrument is always included when the track has one
    expect(firstTrack?.instrument).toBeDefined();
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
    expect(firstScene?.path).toBe("s0");
  });

  it("reads return tracks and locators", async () => {
    // Test 1: With tracks include - verify return tracks
    const returnResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["tracks"] },
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
    // The token to send back, so a caller names the section instead of the bar.
    expect(locatorsParsed.locators?.[1]?.position).toBe("loc:Verse");
  });

  it("falls back to the ID for a locator named like an ID", async () => {
    // A name shaped like a positional ID resolves as that ID, which points at
    // whichever locator sits at that index — not this one.
    await ctx.client!.callTool({
      name: "ppal-update-live-set",
      arguments: {
        locatorOperation: "create",
        locatorTime: "2|1",
        locatorName: "locator-0",
      },
    });
    await sleep(100);

    try {
      const parsed = parseToolResult<ReadLiveSetResult>(
        await ctx.client!.callTool({
          name: "ppal-read-live-set",
          arguments: { include: ["locators"] },
        }),
      );
      const named = parsed.locators?.find((l) => l.name === "locator-0");

      expect(named).toBeDefined();
      expect(named!.position).toBe(`loc:${named!.id}`);
      expect(named!.id).not.toBe("locator-0");
    } finally {
      await ctx.client!.callTool({
        name: "ppal-update-live-set",
        arguments: { locatorOperation: "delete", locatorTime: "2|1" },
      });
    }
  });
});

/**
 * Type for ppal-read-live-set result
 */
interface ReadLiveSetResult {
  id?: string;
  name?: string;
  tempo: number;
  timeSignature: string;
  sceneCount?: number;
  regularTrackCount?: number;
  scenes?: Array<{ id: string; name: string; path: string }>;
  tracks?: Array<{
    id: string;
    name: string;
    type: "midi" | "audio";
    path: string;
    instrument?: { id: string; name: string } | null;
  }>;
  returnTracks?: Array<{ id: string; name: string; path: string }>;
  locators?: Array<{
    id: string;
    name: string;
    time: string;
    position: string;
  }>;
}
