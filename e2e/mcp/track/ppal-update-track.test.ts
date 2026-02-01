/**
 * E2E tests for ppal-update-track tool
 * Updates track properties - these modifications persist within the session.
 * Uses: e2e-test-set (note: t5 is soloed by default, must unsolo first)
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

const ctx = setupMcpTestContext();

describe("ppal-update-track", () => {
  it("updates track properties and verifies changes", async () => {
    // Get first track ID
    const liveSetResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const liveSet = parseToolResult<LiveSetResult>(liveSetResult);
    const trackId = liveSet.tracks![0]!.id;
    const secondTrackId = liveSet.tracks![1]!.id;

    // Unsolo t5 which is soloed by default in e2e-test-set
    // This ensures mute/solo tests work correctly
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: liveSet.tracks![5]!.id, solo: false },
    });

    await sleep(100);

    // Test 1: Update track name
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: trackId, name: "Renamed Track" },
    });

    await sleep(100);
    const afterName = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId },
    });
    const namedTrack = parseToolResult<ReadTrackResult>(afterName);

    expect(namedTrack.name).toBe("Renamed Track");

    // Test 2: Update track color
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: trackId, color: "#0000FF" },
    });

    await sleep(100);
    const afterColor = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId, include: ["color"] },
    });
    const coloredTrack = parseToolResult<ReadTrackResult>(afterColor);

    // Color may be quantized to Live's palette
    expect(coloredTrack.color).toBeDefined();

    // Test 3: Update gainDb
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: trackId, gainDb: -6 },
    });

    await sleep(100);
    const afterGain = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId, include: ["mixer"] },
    });
    const gainTrack = parseToolResult<ReadTrackResult>(afterGain);

    expect(gainTrack.gainDb).toBeCloseTo(-6, 1);

    // Test 4: Update pan (stereo mode)
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: trackId, pan: 0.5 },
    });

    await sleep(100);
    const afterPan = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId, include: ["mixer"] },
    });
    const panTrack = parseToolResult<ReadTrackResult>(afterPan);

    expect(panTrack.pan).toBeCloseTo(0.5, 1);

    // Test 5: Update mute state
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: trackId, mute: true },
    });

    await sleep(100);
    const afterMute = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId },
    });
    const mutedTrack = parseToolResult<ReadTrackResult>(afterMute);

    expect(mutedTrack.state).toBe("muted");

    // Unmute for further tests
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: trackId, mute: false },
    });

    // Test 6: Update solo state
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: trackId, solo: true },
    });

    await sleep(100);
    const afterSolo = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId },
    });
    const soloedTrack = parseToolResult<ReadTrackResult>(afterSolo);

    expect(soloedTrack.state).toBe("soloed");

    // Unsolo
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: trackId, solo: false },
    });

    // Test 7: Update arm state
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: trackId, arm: true },
    });

    await sleep(100);
    const afterArm = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId },
    });
    const armedTrack = parseToolResult<ReadTrackResult>(afterArm);

    expect(armedTrack.isArmed).toBe(true);

    // Disarm
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: trackId, arm: false },
    });

    // Test 8: Batch update multiple tracks
    const batchResult = await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: `${trackId}, ${secondTrackId}`, mute: true },
    });
    const batch = parseToolResult<UpdateTrackResult[]>(batchResult);

    expect(Array.isArray(batch)).toBe(true);
    expect(batch).toHaveLength(2);

    await sleep(100);
    const verifyFirst = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId },
    });
    const verifySecond = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId: secondTrackId },
    });
    const firstTrack = parseToolResult<ReadTrackResult>(verifyFirst);
    const secondTrack = parseToolResult<ReadTrackResult>(verifySecond);

    expect(firstTrack.state).toBe("muted");
    expect(secondTrack.state).toBe("muted");

    // Unmute both
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: `${trackId}, ${secondTrackId}`, mute: false },
    });

    // Test 9: Update panning mode to split
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: {
        ids: trackId,
        panningMode: "split",
        leftPan: -0.5,
        rightPan: 0.5,
      },
    });

    await sleep(100);
    const afterSplit = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId, include: ["mixer"] },
    });
    const splitTrack = parseToolResult<ReadTrackResult>(afterSplit);

    expect(splitTrack.panningMode).toBe("split");
    expect(splitTrack.leftPan).toBeCloseTo(-0.5, 1);
    expect(splitTrack.rightPan).toBeCloseTo(0.5, 1);

    // Return to stereo mode
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: trackId, panningMode: "stereo", pan: 0 },
    });

    // Test 10: Update monitoring state
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: trackId, monitoringState: "in" },
    });

    await sleep(100);
    const afterMonitor = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId, include: ["routings"] },
    });
    const monitorTrack = parseToolResult<ReadTrackResult>(afterMonitor);

    expect(monitorTrack.monitoringState).toBe("in");

    // Return to auto
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: trackId, monitoringState: "auto" },
    });

    // Note: arrangementFollower: false cannot be tested reliably because
    // a track only stops following arrangement when a session clip is launched.
    // The back_to_arranger property can only trigger "go back to arrangement".

    // Test 11: Send operations - first create a return track
    const returnResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "return", name: "A-TestReturn" },
    });
    const returnTrack = parseToolResult<CreateTrackResult>(returnResult);

    expect(returnTrack.id).toBeDefined();

    await sleep(100);

    // Now update send level to the return track
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { ids: trackId, sendGainDb: -12, sendReturn: "A" },
    });

    await sleep(100);
    const afterSend = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackId, include: ["mixer"] },
    });
    const sendTrack = parseToolResult<ReadTrackResult>(afterSend);

    // Verify sends array contains the return
    expect(sendTrack.sends).toBeDefined();
    expect(Array.isArray(sendTrack.sends)).toBe(true);
    expect(sendTrack.sends!.length).toBeGreaterThan(0);

    const firstSend = sendTrack.sends![0]!;

    expect(firstSend.gainDb).toBeCloseTo(-12, 1);
  });
});

interface LiveSetResult {
  tracks?: Array<{ id: string; name: string }>;
}

interface CreateTrackResult {
  id: string;
  returnTrackIndex?: number;
}

interface UpdateTrackResult {
  id: string;
}

interface ReadTrackResult {
  id: string;
  name: string;
  color?: string;
  gainDb?: number;
  pan?: number;
  panningMode?: "stereo" | "split";
  leftPan?: number;
  rightPan?: number;
  state?: string;
  isArmed?: boolean;
  monitoringState?: string;
  sends?: Array<{ name: string; gainDb: number }>;
}
