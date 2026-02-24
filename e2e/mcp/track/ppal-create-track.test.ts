// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-create-track tool
 * Creates tracks in the Live Set - these modifications persist within the session.
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

describe("ppal-create-track", () => {
  it("creates midi, audio, and return tracks", async () => {
    // Test 1: Create single MIDI track (default type)
    const midiResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: {},
    });
    const midi = parseToolResult<CreateTrackResult>(midiResult);

    expect(midi.id).toBeDefined();
    expect(typeof midi.trackIndex).toBe("number");

    await sleep(100);
    const verifyMidi = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId: midi.id },
    });
    const midiTrack = parseToolResult<ReadTrackResult>(verifyMidi);

    expect(midiTrack.type).toBe("midi");
    expect(midiTrack.id).toBeDefined();

    // Test 2: Create audio track
    const audioResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "audio" },
    });
    const audio = parseToolResult<CreateTrackResult>(audioResult);

    expect(audio.id).toBeDefined();

    await sleep(100);
    const verifyAudio = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId: audio.id },
    });
    const audioTrack = parseToolResult<ReadTrackResult>(verifyAudio);

    expect(audioTrack.type).toBe("audio");

    // Test 3: Create return track
    const returnResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "return" },
    });
    const returnTrack = parseToolResult<CreateTrackResult>(returnResult);

    expect(returnTrack.id).toBeDefined();
    expect(typeof returnTrack.returnTrackIndex).toBe("number");

    await sleep(100);
    const verifyReturn = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: {
        trackIndex: returnTrack.returnTrackIndex,
        category: "return",
      },
    });
    const returnRead = parseToolResult<ReadTrackResult>(verifyReturn);

    expect(returnRead.id).toBeDefined();
  });

  it("creates tracks with custom properties", async () => {
    // Test 1: Create track with custom name
    const namedResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { name: "Test Synth Lead" },
    });
    const named = parseToolResult<CreateTrackResult>(namedResult);

    await sleep(100);
    const verifyNamed = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId: named.id },
    });
    const namedTrack = parseToolResult<ReadTrackResult>(verifyNamed);

    expect(namedTrack.name).toBe("Test Synth Lead");

    // Test 2: Create track with color
    const colorResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { name: "Colored Track", color: "#FF0000" },
    });
    const colored = parseToolResult<CreateTrackResult>(colorResult);

    await sleep(100);
    const verifyColored = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId: colored.id, include: ["color"] },
    });
    const coloredTrack = parseToolResult<ReadTrackResult>(verifyColored);

    // Color may be quantized to Live's palette, but should be set
    expect(coloredTrack.color).toBeDefined();

    // Test 3: Create track with mute: true
    const mutedResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { name: "Muted Track", mute: true },
    });
    const muted = parseToolResult<CreateTrackResult>(mutedResult);

    await sleep(100);
    const verifyMuted = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId: muted.id },
    });
    const mutedTrack = parseToolResult<ReadTrackResult>(verifyMuted);

    // State may be "muted" or "muted-also-via-solo" if another track is soloed
    expect(mutedTrack.state).toMatch(/^muted/);

    // Test 4: Create track at specific index
    const atIndexResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { trackIndex: 0, name: "First Position" },
    });
    const atIndex = parseToolResult<CreateTrackResult>(atIndexResult);

    expect(atIndex.trackIndex).toBe(0);
  });

  it("creates multiple tracks in batch", async () => {
    // Get initial track count
    const initialResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["tracks"] },
    });
    const initial = parseToolResult<LiveSetResult>(initialResult);
    const initialTrackCount = initial.tracks?.length ?? 0;

    // Test 1: Create multiple tracks with count
    const batchResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { count: 2 },
    });
    const batch = parseToolResult<CreateTrackResult[]>(batchResult);

    expect(Array.isArray(batch)).toBe(true);
    expect(batch).toHaveLength(2);
    expect(batch[0]!.id).toBeDefined();
    expect(batch[1]!.id).toBeDefined();

    // Test 2: Create multiple tracks with comma-separated names
    const multiNameResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { count: 2, name: "Kick,Snare" },
    });
    const multiName = parseToolResult<CreateTrackResult[]>(multiNameResult);

    expect(multiName).toHaveLength(2);

    await sleep(100);
    const verifyKick = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId: multiName[0]!.id },
    });
    const kickTrack = parseToolResult<ReadTrackResult>(verifyKick);

    const verifySnare = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId: multiName[1]!.id },
    });
    const snareTrack = parseToolResult<ReadTrackResult>(verifySnare);

    expect(kickTrack.name).toBe("Kick");
    expect(snareTrack.name).toBe("Snare");

    // Test 3: Create multiple tracks with comma-separated colors
    const multiColorResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { count: 2, name: "Red,Green", color: "#FF0000,#00FF00" },
    });
    const multiColor = parseToolResult<CreateTrackResult[]>(multiColorResult);

    expect(multiColor).toHaveLength(2);

    await sleep(100);
    const verifyRed = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId: multiColor[0]!.id, include: ["color"] },
    });
    const verifyGreen = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId: multiColor[1]!.id, include: ["color"] },
    });
    const redTrack = parseToolResult<ReadTrackResult>(verifyRed);
    const greenTrack = parseToolResult<ReadTrackResult>(verifyGreen);

    expect(redTrack.name).toBe("Red");
    expect(greenTrack.name).toBe("Green");
    expect(redTrack.color).toBeDefined();
    expect(greenTrack.color).toBeDefined();

    // Verify track count increased
    const finalResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["tracks"] },
    });
    const final = parseToolResult<LiveSetResult>(finalResult);
    const finalTrackCount = final.tracks?.length ?? 0;

    // Created: 2 batch + 2 multi-name + 2 multi-color = 6
    expect(finalTrackCount).toBeGreaterThan(initialTrackCount);
  });
});

interface LiveSetResult {
  tracks?: Array<{ id: string; name: string }>;
}

interface CreateTrackResult {
  id: string;
  trackIndex?: number;
  returnTrackIndex?: number;
}

interface ReadTrackResult {
  id: string;
  type: "midi" | "audio";
  name: string;
  color?: string;
  state?: string;
}
