// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
  getToolWarnings,
  parseBatchResult,
  parseToolResult,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

async function readTracks(): Promise<LiveSetResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-live-set",
    arguments: { include: ["tracks"] },
  });

  return parseToolResult<LiveSetResult>(result);
}

/** Read a track's mixer after giving Live a moment to settle. */
async function readTrackMixer(trackId: string): Promise<ReadTrackResult> {
  await sleep(100);

  return parseToolResult<ReadTrackResult>(
    await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { id: trackId, include: ["mixer"] },
    }),
  );
}

describe("ppal-update-track", () => {
  it("updates track name, color, and gain", async () => {
    const liveSet = await readTracks();
    const trackId = liveSet.tracks![0]!.id;

    // Test 1: Update track name
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: trackId, name: "Renamed Track" },
    });

    await sleep(100);
    const afterName = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { id: trackId },
    });
    const namedTrack = parseToolResult<ReadTrackResult>(afterName);

    expect(namedTrack.name).toBe("Renamed Track");

    // Test 2: Update track color
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: trackId, color: "#0000FF" },
    });

    await sleep(100);
    const afterColor = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { id: trackId, include: ["color"] },
    });
    const coloredTrack = parseToolResult<ReadTrackResult>(afterColor);

    // Color may be quantized to Live's palette
    expect(coloredTrack.color).toBeDefined();

    // Test 3: Update gainDb
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: trackId, gainDb: -6 },
    });

    const gainTrack = await readTrackMixer(trackId);

    expect(gainTrack.gainDb).toBeCloseTo(-6, 1);
  });

  it("updates track mute, solo, and arm states", async () => {
    const liveSet = await readTracks();
    const trackId = liveSet.tracks![0]!.id;

    // Unsolo t5 which is soloed by default in e2e-test-set
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: liveSet.tracks![5]!.id, solo: false },
    });

    await sleep(100);

    // Test 1: Update mute state
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: trackId, mute: true },
    });

    await sleep(100);
    const afterMute = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { id: trackId },
    });
    const mutedTrack = parseToolResult<ReadTrackResult>(afterMute);

    expect(mutedTrack.state).toBe("muted");

    // Unmute for further tests
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: trackId, mute: false },
    });

    // Test 2: Update solo state
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: trackId, solo: true },
    });

    await sleep(100);
    const afterSolo = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { id: trackId },
    });
    const soloedTrack = parseToolResult<ReadTrackResult>(afterSolo);

    expect(soloedTrack.state).toBe("soloed");

    // Unsolo
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: trackId, solo: false },
    });

    // Test 3: Update arm state
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: trackId, arm: true },
    });

    await sleep(100);
    const afterArm = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { id: trackId },
    });
    const armedTrack = parseToolResult<ReadTrackResult>(afterArm);

    expect(armedTrack.isArmed).toBe(true);

    // Disarm
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: trackId, arm: false },
    });
  });

  it("updates track pan and panning mode", async () => {
    const liveSet = await readTracks();
    const trackId = liveSet.tracks![0]!.id;

    // Test 1: Update pan (stereo mode)
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: trackId, pan: 0.5 },
    });

    const panTrack = await readTrackMixer(trackId);

    expect(panTrack.pan).toBeCloseTo(0.5, 1);

    // Test 2: Update panning mode to split
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: {
        id: trackId,
        panningMode: "split",
        leftPan: -0.5,
        rightPan: 0.5,
      },
    });

    const splitTrack = await readTrackMixer(trackId);

    expect(splitTrack.panningMode).toBe("split");
    expect(splitTrack.leftPan).toBeCloseTo(-0.5, 1);
    expect(splitTrack.rightPan).toBeCloseTo(0.5, 1);

    // Return to stereo mode
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: trackId, panningMode: "stereo", pan: 0 },
    });
  });

  it("updates multiple tracks in batch", async () => {
    const liveSet = await readTracks();
    const trackId = liveSet.tracks![0]!.id;
    const secondTrackId = liveSet.tracks![1]!.id;

    // Unsolo t5 which is soloed by default
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: liveSet.tracks![5]!.id, solo: false },
    });

    await sleep(100);

    // Test: Batch update multiple tracks
    const batchResult = await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: `${trackId}, ${secondTrackId}`, mute: true },
    });

    parseBatchResult<UpdateTrackResult>(batchResult, 2);

    await sleep(100);
    const verifyFirst = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { id: trackId },
    });
    const verifySecond = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { id: secondTrackId },
    });
    const firstTrack = parseToolResult<ReadTrackResult>(verifyFirst);
    const secondTrack = parseToolResult<ReadTrackResult>(verifySecond);

    expect(firstTrack.state).toBe("muted");
    expect(secondTrack.state).toBe("muted");

    // Unmute both
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: `${trackId}, ${secondTrackId}`, mute: false },
    });
  });

  it("updates send levels and monitoring", async () => {
    const liveSet = await readTracks();
    const trackId = liveSet.tracks![0]!.id;

    // Test 1: Update monitoring state
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: trackId, monitoringState: "in" },
    });

    await sleep(100);
    const afterMonitor = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { id: trackId, include: ["routings"] },
    });
    const monitorTrack = parseToolResult<ReadTrackResult>(afterMonitor);

    expect(monitorTrack.monitoringState).toBe("in");

    // Return to auto
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: trackId, monitoringState: "auto" },
    });

    // Test 2: Send operations - first create a return track
    const returnResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { path: "rt+", name: "A-TestReturn" },
    });
    const returnTrack = parseToolResult<CreateTrackResult>(returnResult);

    expect(returnTrack.id).toBeDefined();

    await sleep(100);

    // Now update send level to the return track
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: trackId, sendGainDb: -12, sendReturn: "A" },
    });

    const sendTrack = await readTrackMixer(trackId);

    // Verify sends array contains the return
    expect(sendTrack.sends).toBeDefined();
    expect(Array.isArray(sendTrack.sends)).toBe(true);
    expect(sendTrack.sends!.length).toBeGreaterThan(0);

    const firstSend = sendTrack.sends![0]!;

    expect(firstSend.gainDb).toBeCloseTo(-12, 1);

    // Same send, addressed by the return track's id. Neither name nor letter
    // gets here reliably: "A" matches A-Delay first, and Live renames the
    // return it was asked to call "A-TestReturn". Only real Live proves the id
    // the read tools report is the one the send lookup matches on.
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: trackId, sendGainDb: -24, sendReturn: returnTrack.id },
    });

    const byId = await readTrackMixer(trackId);

    // Sends are index-aligned with the return tracks, so the new one is last.
    expect(byId.sends!.at(-1)!.gainDb).toBeCloseTo(-24, 1);
    // The send "A" reached is untouched, so the id picked its own return.
    expect(byId.sends![0]!.gainDb).toBeCloseTo(-12, 1);
  });

  it("sets several sends in one call, matched by return rather than position", async () => {
    const liveSet = await readTracks();
    // Not tracks[0] — the send tests above leave levels on it.
    const trackId = liveSet.tracks![1]!.id;
    const [first, second] = liveSet.returnTracks!;

    // Listed in the opposite order to the sends themselves, and spelled two
    // different ways, so a list that landed by position or only matched names
    // would fail. Only real Live proves the id the read reports is the one the
    // send lookup matches on.
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: {
        id: trackId,
        sends: [
          { return: second!.name, gainDb: -21 },
          { return: first!.id, gainDb: -9 },
        ],
      },
    });

    const track = await readTrackMixer(trackId);

    expect(track.sends![0]!.return).toBe(first!.name);
    expect(track.sends![0]!.gainDb).toBeCloseTo(-9, 1);
    expect(track.sends![1]!.return).toBe(second!.name);
    expect(track.sends![1]!.gainDb).toBeCloseTo(-21, 1);
  });

  it("reports track and send gain at Live's display resolution", async () => {
    const liveSet = await readTracks();
    const trackId = liveSet.tracks![2]!.id;
    const returnTrack = liveSet.returnTracks![0]!;

    // Live hands back a 32-bit float, so an unrounded read reports -6.333000183105469.
    await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: {
        id: trackId,
        gainDb: -6.333333,
        sends: [{ return: returnTrack.id, gainDb: -9.55 }],
      },
    });

    const track = await readTrackMixer(trackId);

    expect(track.gainDb).toBe(-6.33);
    expect(track.sends![0]!.gainDb).toBe(-9.55);
  });

  // Principle 5: the write result says what landed. The level is clamped and
  // snapped by Live, so the argument alone doesn't say what the send holds.
  it("reports the sends it wrote, read back at Live's display resolution", async () => {
    const liveSet = await readTracks();
    const trackId = liveSet.tracks![3]!.id;
    const returnTrack = liveSet.returnTracks![0]!;

    const result = await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: {
        id: trackId,
        sends: [{ return: returnTrack.id, gainDb: -6.333333 }],
      },
    });

    // Live hands back a 32-bit float, so an unrounded read reports
    // -6.333000183105469. The id is the one a read reports, so the result
    // round-trips straight back into `sends`.
    expect(parseToolResult<UpdateTrackResult>(result).sends).toStrictEqual([
      {
        return: returnTrack.name,
        returnId: returnTrack.id,
        gainDb: -6.33,
      },
    ]);
  });

  it("reports the sendGainDb/sendReturn pair under sends too", async () => {
    const liveSet = await readTracks();
    const trackId = liveSet.tracks![3]!.id;
    const returnTrack = liveSet.returnTracks![1]!;

    // One send has one shape in the result, whichever param spelled it.
    const result = await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: trackId, sendGainDb: -18, sendReturn: returnTrack.id },
    });

    expect(parseToolResult<UpdateTrackResult>(result).sends).toStrictEqual([
      { return: returnTrack.name, returnId: returnTrack.id, gainDb: -18 },
    ]);
  });

  it("reports no send for a return name that matches none", async () => {
    const liveSet = await readTracks();
    const trackId = liveSet.tracks![3]!.id;

    const result = await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { id: trackId, sends: [{ return: "ZZZ", gainDb: -6 }] },
    });

    const { data, warnings } =
      parseToolResultWithWarnings<UpdateTrackResult>(result);

    expect(warnings).toContainEqual(
      expect.stringContaining('sends entry "ZZZ" names no return track'),
    );
    // Nothing was written, so nothing is reported as though it had been.
    expect(data.sends).toBeUndefined();
  });

  it("lets a sends entry override the scalar pair naming the same return", async () => {
    const liveSet = await readTracks();
    const trackId = liveSet.tracks![2]!.id;
    const returnTrack = liveSet.returnTracks![0]!;

    // The pair and the list name one return by two different spellings, so the
    // collision is only seen if both resolve to the same index.
    const result = await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: {
        id: trackId,
        sendGainDb: -30,
        sendReturn: returnTrack.id,
        sends: [{ return: returnTrack.name, gainDb: -15 }],
      },
    });

    expect(getToolWarnings(result)).toContainEqual(
      expect.stringContaining("sends overrides sendGainDb/sendReturn"),
    );

    const track = await readTrackMixer(trackId);

    // The list is the later word, so the pair's -30 must not be what stuck.
    expect(track.sends![0]!.gainDb).toBeCloseTo(-15, 1);
  });
});

interface LiveSetResult {
  tracks?: Array<{ id: string; name: string }>;
  returnTracks?: Array<{ id: string; name: string }>;
}

interface CreateTrackResult {
  id: string;
}

interface UpdateTrackResult {
  id: string;
  sends?: Array<{ return: string; returnId?: string; gainDb: number }>;
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
  sends?: Array<{ return: string; gainDb: number }>;
}
