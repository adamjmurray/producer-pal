// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
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
  parseAliasedToolResult,
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
      arguments: { include: ["tracks"] },
    });
    const liveSet = parseToolResult<LiveSetResult>(liveSetResult);
    const firstTrack = liveSet.tracks![0]!;
    const trackId = firstTrack.id;

    // Test 1: Read track by id, spelled the way a model guesses it. "trackId"
    // is a permanent alias, so this checks the read and the steer.
    const byIdResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId },
    });
    const byId = parseAliasedToolResult<ReadTrackResult>(
      byIdResult,
      "trackId",
      "id",
    );

    expect(byId.id).toBe(trackId);
    expect(byId.name).toBe(firstTrack.name);
    expect(byId.type).toBe("midi");

    // Test 2: Read track by path
    const byIndexResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { path: "t0" },
    });
    const byIndex = parseToolResult<ReadTrackResult>(byIndexResult);

    expect(byIndex.id).toBe(trackId);
    expect(byIndex.path).toBe("t0");
    expect(byIndex.type).toBe("midi");

    // Test 3: Read return track
    const returnResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { path: "rt0" },
    });
    const returnTrack = parseToolResult<ReadTrackResult>(returnResult);

    expect(returnTrack.id).toBeDefined();
    expect(returnTrack.path).toBe("rt0");

    // Test 4: Read master track
    const masterResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { path: "mt" },
    });
    const master = parseToolResult<ReadTrackResult>(masterResult);

    expect(master.id).toBeDefined();
    expect(master.id).toBeDefined();

    // Test 5: Default include - instruments, drum-map, all-clips
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
      arguments: { id: trackId, include: ["mixer"] },
    });
    const mixer = parseToolResult<ReadTrackResult>(mixerResult);

    expect(typeof mixer.gainDb).toBe("number");
    expect(typeof mixer.pan).toBe("number");

    // Test 7: Read with include: ["color"]
    const colorResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { id: trackId, include: ["color"] },
    });
    const color = parseToolResult<ReadTrackResult>(colorResult);

    expect(color.color).toBeDefined();
    expect(color.color).toMatch(/^#[0-9A-Fa-f]{6}$/);

    // Test 8: Read with include: ["*"] (all data)
    const allResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { id: trackId, include: ["*"] },
    });
    const all = parseToolResult<ReadTrackResult>(allResult);

    expect(all.color).toBeDefined();
    expect(typeof all.gainDb).toBe("number");

    // Test 9: Non-existent track throws error
    const nonExistentResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { path: "t999" },
    });

    expect(isToolError(nonExistentResult)).toBe(true);
    expect(getToolErrorMessage(nonExistentResult)).toContain(
      'nothing at path "t999"',
    );

    // Test 10: Verify first 4 tracks are MIDI type (Drums, Bass, Keys, Lead)
    for (let i = 0; i < 4; i++) {
      const trackResult = await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { path: `t${i}` },
      });
      const track = parseToolResult<ReadTrackResult>(trackResult);

      expect(track.type).toBe("midi");
      expect(track.path).toBe(`t${i}`);
    }

    // Test 11: Verify audio tracks exist (t4, t5, t6 are Audio 1, Audio 2, FX Bus)
    const audioTrackResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { path: "t4" },
    });
    const audioTrack = parseToolResult<ReadTrackResult>(audioTrackResult);

    expect(audioTrack.type).toBe("audio");
    expect(audioTrack.path).toBe("t4");

    // Test 12: Find Producer Pal host track (t11 "PPAL" in e2e-test-set)
    const ppalTrackResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { path: "t11" },
    });
    const ppalTrack = parseToolResult<ReadTrackResult>(ppalTrackResult);

    expect(ppalTrack.hasProducerPalDevice).toBe(true);
  });

  it("reads group track relationships and routing", async () => {
    // Test group: t9 is parent of t10
    const parentResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { path: "t9" },
    });
    const parentTrack = parseToolResult<ReadTrackResult>(parentResult);

    expect(parentTrack.isGroup).toBe(true);

    const childResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { path: "t10" },
    });
    const childTrack = parseToolResult<ReadTrackResult>(childResult);

    expect(childTrack.groupId).toBe(parentTrack.id);

    // Test routing: t4 outputs to t6 "FX Bus"
    const routingResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { path: "t4", include: ["routings"] },
    });
    const routedTrack = parseToolResult<ReadTrackResult>(routingResult);

    expect(routedTrack.outputRoutingType).toBeDefined();
    expect(routedTrack.outputRoutingType?.name).toContain("FX Bus");
  });

  it("names warp as an include, and only then reports it", async () => {
    // t4's session clip is a warped audio clip. `warp` used to reach the nested
    // clip read through `*` while read-track's own enum rejected it by name, so
    // the data was gettable but not askable. This goes through the real schema,
    // which is the only place that rejection lived.
    const clipWith = async (include: string[]) => {
      const track = parseToolResult<ReadTrackResult>(
        await ctx.client!.callTool({
          name: "ppal-read-track",
          arguments: { path: "t4", include },
        }),
      );

      return track.sessionClips?.[0];
    };

    const named = await clipWith(["session-clips", "warp"]);

    expect(named?.warping).toBe(true);
    expect(named?.warpMode).toBeDefined();

    // Publishing the option must not cost `*` the data it already returned.
    expect((await clipWith(["*"]))?.warping).toBe(true);

    const unasked = await clipWith(["session-clips"]);

    expect(unasked?.warping).toBeUndefined();
    expect(unasked?.warpMode).toBeUndefined();
  });

  it("reports each send's return track id alongside its name", async () => {
    // The id is the only thing that tells two same-named returns apart, and
    // update-track's sends/sendReturn accept it. Only real Live proves the id
    // the read reports is the return track's own.
    const liveSet = parseToolResult<LiveSetResult>(
      await ctx.client!.callTool({
        name: "ppal-read-live-set",
        arguments: { include: ["tracks"] },
      }),
    );
    const returnTracks = liveSet.returnTracks!;

    expect(returnTracks.length).toBeGreaterThan(0);

    const track = parseToolResult<ReadTrackResult>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { path: "t0", include: ["mixer"] },
      }),
    );

    // A return track has sends of its own, so it goes through the same read.
    const returnTrack = parseToolResult<ReadTrackResult>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { path: "rt0", include: ["mixer"] },
      }),
    );

    // Sends are index-aligned with the Live Set's return tracks.
    for (const read of [track, returnTrack]) {
      expect(read.sends).toHaveLength(returnTracks.length);

      for (const [i, send] of read.sends!.entries()) {
        expect(send.return).toBe(returnTracks[i]!.name);
        expect(send.returnId).toBe(returnTracks[i]!.id);
      }
    }
  });
});

interface LiveSetResult {
  tracks?: Array<{
    id: string;
    name: string;
    type: string;
    path: string;
  }>;
  returnTracks?: Array<{ id: string; name: string }>;
}

interface ReadTrackResult {
  id: string | null;
  type: "midi" | "audio" | null;
  name: string | null;
  path?: string;
  hasProducerPalDevice?: boolean;
  isGroup?: boolean;
  groupId?: string;
  color?: string;
  sessionClips?: Array<{
    id: string;
    name: string;
    slotIndex: number;
    warping?: boolean;
    warpMode?: string;
  }>;
  arrangementClips?: Array<{ id: string; position: string; length: string }>;
  sessionClipCount?: number;
  arrangementClipCount?: number;
  instrument?: { id: string; name: string } | null;
  drumMap?: Record<string, string> | null;
  gainDb?: number;
  pan?: number;
  sends?: Array<{ return: string; returnId?: string; gainDb: number }>;
  outputRoutingType?: { name: string; outputId: string };
}
