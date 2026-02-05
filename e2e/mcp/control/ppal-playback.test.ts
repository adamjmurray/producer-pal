// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * E2E tests for ppal-playback tool
 * Tests playback control across arrangement and session views.
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

describe("ppal-playback", () => {
  it("controls playback for arrangement and session views", async () => {
    // Test 1: Verify initial stopped state with stop action
    const stopResult = await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: { action: "stop" },
    });
    const stopped = parseToolResult<PlaybackResult>(stopResult);

    expect(stopped.playing).toBe(false);
    expect(stopped.currentTime).toBe("1|1");

    // Test 2: Play arrangement from start
    const playResult = await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: { action: "play-arrangement" },
    });
    const playing = parseToolResult<PlaybackResult>(playResult);

    expect(playing.playing).toBe(true);
    expect(playing.currentTime).toBe("1|1");

    await sleep(100);

    // Test 3: Play arrangement from specific position
    const playFromResult = await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: { action: "play-arrangement", startTime: "5|1" },
    });
    const playFrom = parseToolResult<PlaybackResult>(playFromResult);

    expect(playFrom.playing).toBe(true);
    expect(playFrom.currentTime).toBe("5|1");

    // Test 4: Update arrangement with loop settings
    const loopResult = await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: {
        action: "update-arrangement",
        loop: true,
        loopStart: "3|1",
        loopEnd: "7|1",
      },
    });
    const looped = parseToolResult<PlaybackResult>(loopResult);

    expect(looped.arrangementLoop).toBeDefined();
    expect(looped.arrangementLoop?.start).toBe("3|1");
    expect(looped.arrangementLoop?.end).toBe("7|1");

    // Test 5: Stop playback
    const stop2Result = await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: { action: "stop" },
    });
    const stopped2 = parseToolResult<PlaybackResult>(stop2Result);

    expect(stopped2.playing).toBe(false);
    expect(stopped2.currentTime).toBe("1|1");

    // Test 6: Create session clips for session view tests
    // Use empty track t8 (9-MIDI) to avoid conflicts with pre-populated clips
    const emptyMidiTrack = 8;

    const createClip1 = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: emptyMidiTrack,
        sceneIndex: "0",
        notes: "C3 1|1",
        length: "1:0.0",
      },
    });
    const clip1 = parseToolResult<{ id: string }>(createClip1);

    const createClip2 = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: emptyMidiTrack,
        sceneIndex: "1",
        notes: "D3 1|1",
        length: "1:0.0",
      },
    });
    const clip2 = parseToolResult<{ id: string }>(createClip2);

    await sleep(100);

    // Test 7: Play session clips
    const playClipsResult = await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: {
        action: "play-session-clips",
        clipIds: `${clip1.id},${clip2.id}`,
      },
    });
    const playingClips = parseToolResult<PlaybackResult>(playClipsResult);

    expect(playingClips.playing).toBe(true);

    await sleep(100);

    // Test 8: Stop specific session clips
    const stopClipsResult = await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: {
        action: "stop-session-clips",
        clipIds: clip1.id,
      },
    });
    const stoppedClips = parseToolResult<PlaybackResult>(stopClipsResult);

    expect(stoppedClips).toBeDefined();

    // Test 9: Stop all session clips
    const stopAllResult = await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: { action: "stop-all-session-clips" },
    });
    const stoppedAll = parseToolResult<PlaybackResult>(stopAllResult);

    expect(stoppedAll).toBeDefined();

    // Test 10: Play scene
    const playSceneResult = await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: { action: "play-scene", sceneIndex: 0 },
    });
    const playingScene = parseToolResult<PlaybackResult>(playSceneResult);

    expect(playingScene.playing).toBe(true);

    // Test 11: Final stop to clean up and verify arrangementFollowerTrackIds
    const finalResult = await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: { action: "stop" },
    });
    const final = parseToolResult<PlaybackResult>(finalResult);

    expect(final.playing).toBe(false);
    expect(final.arrangementFollowerTrackIds).toBeDefined();
  });
});

interface PlaybackResult {
  playing: boolean;
  currentTime: string;
  arrangementLoop?: { start: string; end: string };
  arrangementFollowerTrackIds?: string;
}
