// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-read-track tool
 * Uses: e2e-test-set (12 tracks: t0-t3 MIDI, t4-t6 Audio, t7-t8 MIDI, t9 Group, t10-t11 MIDI)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
} from "../mcp-test-helpers";

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

    // Test 9: Non-existent track throws error
    const nonExistentResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackIndex: 999, category: "regular" },
    });

    expect(isToolError(nonExistentResult)).toBe(true);
    expect(getToolErrorMessage(nonExistentResult)).toContain(
      "trackIndex 999 does not exist",
    );

    // Test 10: Verify first 4 tracks are MIDI type (Drums, Bass, Keys, Lead)
    for (let i = 0; i < 4; i++) {
      const trackResult = await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { trackIndex: i, category: "regular" },
      });
      const track = parseToolResult<ReadTrackResult>(trackResult);

      expect(track.type).toBe("midi");
      expect(track.trackIndex).toBe(i);
    }

    // Test 11: Verify audio tracks exist (t4, t5, t6 are Audio 1, Audio 2, FX Bus)
    const audioTrackResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackIndex: 4, category: "regular" },
    });
    const audioTrack = parseToolResult<ReadTrackResult>(audioTrackResult);

    expect(audioTrack.type).toBe("audio");
    expect(audioTrack.trackIndex).toBe(4);

    // Test 12: Find Producer Pal host track (t11 "PPAL" in e2e-test-set)
    const ppalTrackResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackIndex: 11, category: "regular" },
    });
    const ppalTrack = parseToolResult<ReadTrackResult>(ppalTrackResult);

    expect(ppalTrack.hasProducerPalDevice).toBe(true);
  });

  it("reads group track relationships and routing", async () => {
    // Test group: t9 is parent of t10
    const parentResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackIndex: 9, category: "regular" },
    });
    const parentTrack = parseToolResult<ReadTrackResult>(parentResult);

    expect(parentTrack.isGroup).toBe(true);

    const childResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackIndex: 10, category: "regular" },
    });
    const childTrack = parseToolResult<ReadTrackResult>(childResult);

    expect(childTrack.groupId).toBe(parentTrack.id);

    // Test routing: t4 outputs to t6 "FX Bus"
    const routingResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackIndex: 4, category: "regular", include: ["routings"] },
    });
    const routedTrack = parseToolResult<ReadTrackResult>(routingResult);

    expect(routedTrack.outputRoutingType).toBeDefined();
    expect(routedTrack.outputRoutingType?.name).toContain("FX Bus");
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
  isGroup?: boolean;
  groupId?: string;
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
  outputRoutingType?: { name: string; outputId: string };
}
