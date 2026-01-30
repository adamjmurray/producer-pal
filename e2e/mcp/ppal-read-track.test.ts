/**
 * E2E tests for ppal-read-track tool
 * Uses: basic-midi-4-track Live Set (4 MIDI tracks + 1 Producer Pal host track = 5 total)
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import { parseToolResult, setupMcpTestContext } from "./mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

describe("ppal-read-track", () => {
  it("reads tracks by various methods with different include params", async () => {
    // Get a track ID from read-live-set first
    const liveSetResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const liveSet = parseToolResult<LiveSetResult>(liveSetResult);
    const firstTrack = liveSet.tracks![0]!;
    const trackId = firstTrack.id;

    // Test 1: Read track by trackId
    const byIdResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId },
    });
    const byId = parseToolResult<ReadTrackResult>(byIdResult);

    expect(byId.id).toBe(trackId);
    expect(byId.name).toBe(firstTrack.name);
    expect(byId.type).toBe("midi");

    // Test 2: Read track by trackIndex + category (regular)
    const byIndexResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackIndex: 0, category: "regular" },
    });
    const byIndex = parseToolResult<ReadTrackResult>(byIndexResult);

    expect(byIndex.id).toBe(trackId);
    expect(byIndex.trackIndex).toBe(0);
    expect(byIndex.type).toBe("midi");

    // Test 3: Read return track
    const returnResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackIndex: 0, category: "return" },
    });
    const returnTrack = parseToolResult<ReadTrackResult>(returnResult);

    expect(returnTrack.id).toBeDefined();
    expect(returnTrack.returnTrackIndex).toBe(0);

    // Test 4: Read master track
    const masterResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { category: "master" },
    });
    const master = parseToolResult<ReadTrackResult>(masterResult);

    expect(master.id).toBeDefined();
    expect(master.id).toBeDefined();

    // Test 5: Default include - session clips, arrangement clips, instruments, drum-maps
    expect(
      Array.isArray(byId.sessionClips) || byId.sessionClipCount !== undefined,
    ).toBe(true);
    expect(
      Array.isArray(byId.arrangementClips) ||
        byId.arrangementClipCount !== undefined,
    ).toBe(true);
    expect("instrument" in byId).toBe(true);

    // Test 6: Read with include: ["mixer"]
    const mixerResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId, include: ["mixer"] },
    });
    const mixer = parseToolResult<ReadTrackResult>(mixerResult);

    expect(typeof mixer.gainDb).toBe("number");
    expect(typeof mixer.pan).toBe("number");

    // Test 7: Read with include: ["color"]
    const colorResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId, include: ["color"] },
    });
    const color = parseToolResult<ReadTrackResult>(colorResult);

    expect(color.color).toBeDefined();
    expect(color.color).toMatch(/^#[0-9A-Fa-f]{6}$/);

    // Test 8: Read with include: ["*"] (all data)
    const allResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId, include: ["*"] },
    });
    const all = parseToolResult<ReadTrackResult>(allResult);

    expect(all.color).toBeDefined();
    expect(typeof all.gainDb).toBe("number");

    // Test 9: Non-existent track returns exists: false
    const nonExistentResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackIndex: 999, category: "regular" },
    });
    const nonExistent = parseToolResult<ReadTrackResult>(nonExistentResult);

    expect(nonExistent.id).toBeNull();

    // Test 10: Verify all music tracks are MIDI type
    for (let i = 0; i < 4; i++) {
      const trackResult = await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { trackIndex: i, category: "regular" },
      });
      const track = parseToolResult<ReadTrackResult>(trackResult);

      expect(track.type).toBe("midi");
      expect(track.trackIndex).toBe(i);
    }

    // Test 11: Find Producer Pal host track
    let foundHostTrack = false;

    for (let i = 0; i < (liveSet.tracks?.length ?? 0); i++) {
      const trackResult = await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { trackIndex: i, category: "regular" },
      });
      const track = parseToolResult<ReadTrackResult>(trackResult);

      if (track.hasProducerPalDevice) {
        foundHostTrack = true;
        break;
      }
    }

    expect(foundHostTrack).toBe(true);
  });
});

interface LiveSetResult {
  tracks?: Array<{
    id: string;
    name: string;
    type: string;
    trackIndex: number;
  }>;
}

interface ReadTrackResult {
  id: string | null;
  type: "midi" | "audio" | null;
  name: string | null;
  trackIndex?: number | null;
  returnTrackIndex?: number | null;
  hasProducerPalDevice?: boolean;
  color?: string;
  sessionClips?: Array<{ id: string; name: string; slotIndex: number }>;
  arrangementClips?: Array<{ id: string; position: string; length: string }>;
  sessionClipCount?: number;
  arrangementClipCount?: number;
  instrument?: { id: string; name: string } | null;
  drumMap?: Record<string, string> | null;
  gainDb?: number;
  pan?: number;
  sends?: Array<{ name: string; gainDb: number }>;
}
