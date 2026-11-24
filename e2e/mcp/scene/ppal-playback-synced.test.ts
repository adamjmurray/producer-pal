// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for ppal-playback play-session-clips-synced: a clip fired while
 * others loop starts at their next loop start, and restarts nothing.
 * Uses: e2e-test-set (108 BPM; t8, t3 and t0 have nothing in s3)
 * See: e2e/live-sets/specs/e2e-test-set-spec.md
 *
 * The loops are 2 bars (8 beats, 4.4 s). Positions of the reference and the
 * fired clip are read in one ppal-live-api call once the fired clip plays.
 *
 * Run with: npm run e2e:mcp -- scene/ppal-playback-synced
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";
import { type PlaybackResult } from "../control/helpers/playback-test-helpers.ts";
import {
  loopDistance,
  NO_QUANTIZATION,
  ONE_BAR,
  restartError,
  type Slot,
  syncedLaunchCalls,
} from "../control/helpers/synced-launch-test-helpers.ts";

const ctx = setupMcpTestContext();

const REFERENCE: Slot = { track: 8, scene: 3 };
const FIRED: Slot = { track: 3, scene: 3 };
const THIRD: Slot = { track: 0, scene: 3 };
const LENGTH = 8;
// Tolerance in beats: a read takes about 20 ms, which is 0.04 beats
const IN_SYNC = 0.05;
const NOT_RESTARTED = 0.15;

const calls = syncedLaunchCalls(ctx);

type SyncedResult = PlaybackResult & { sync?: string };

let globalQuantization: number | undefined;

/**
 * @returns The result of a synced launch of the fired clip, and how long the
 *   call took
 */
async function fireSynced(): Promise<{ result: SyncedResult; ms: number }> {
  const started = Date.now();
  const result = parseToolResult<SyncedResult>(
    await calls.playbackSynced(FIRED),
  );

  return { result, ms: Date.now() - started };
}

/**
 * Wait for the fired clip to play, then check it is in step with the
 * reference, which was never restarted, and that its quantization is as it was.
 * @param before - The reference's playhead before the call
 * @param quantization - The fired clip's launch quantization before the call
 */
async function expectInSync(
  before: Awaited<ReturnType<typeof calls.snapshot>>,
  quantization: number,
): Promise<void> {
  await calls.waitFor(() => calls.isClipPlaying(FIRED));

  const after = await calls.snapshot([REFERENCE, FIRED]);

  expect(
    loopDistance(after.positions[0]!, after.positions[1]!, LENGTH),
  ).toBeLessThan(IN_SYNC);
  expect(restartError(before, after, 0, LENGTH)).toBeLessThan(NOT_RESTARTED);
  expect(await calls.clipValue(FIRED, "launch_quantization")).toBe(
    quantization,
  );
}

describe("ppal-playback play-session-clips-synced", () => {
  beforeEach(async () => {
    await setConfig({ liveApiEnabled: true });
    globalQuantization = await calls.readGlobalQuantization();
    await calls.makeLoop(REFERENCE, "2bars");
    await calls.makeLoop(FIRED, "2bars");
    await calls.makeLoop(THIRD, "2bars");
  });

  afterEach(async () => {
    await calls.stopAll();

    if (globalQuantization != null) {
      await calls.setGlobalQuantization(globalQuantization);
    }
  });

  it("starts the clip at the reference's next loop start, with no wait", async () => {
    await calls.setGlobalQuantization(ONE_BAR);
    await calls.startLoop(REFERENCE);
    await sleep(500);

    const quantization = await calls.clipValue(FIRED, "launch_quantization");
    const before = await calls.snapshot([REFERENCE]);
    const { result, ms } = await fireSynced();

    expect(result.sync).toMatch(/^starts in \d+(\.\d)?s, when t8\/s3 loops$/);
    expect(ms).toBeLessThan(1500);
    await expectInSync(before, quantization);
  });

  it("waits for a loop start a 1 bar grid can reach, and then syncs", async () => {
    await calls.setGlobalQuantization(ONE_BAR);
    await calls.startLoop(REFERENCE);
    // Fired again, the reference restarts at the next bar line, beat 4: its
    // loop starts are 12, 20, ..., which only a 1 bar grid has a line on.
    await sleep(200);
    await calls.startLoop(REFERENCE);
    // Once the restart has happened (the playhead runs 4 beats behind song
    // time), while the loop start at 12 is still more than a bar off (song
    // time < 8, with room for the reads before the fire).
    await calls.waitFor(async () => {
      const { songTime, positions } = await calls.snapshot([REFERENCE]);

      return Math.abs(songTime - positions[0]! - 4) < 0.1 && songTime < 6.5;
    });

    const quantization = await calls.clipValue(FIRED, "launch_quantization");
    const before = await calls.snapshot([REFERENCE]);
    const { result } = await fireSynced();

    // It fired once the loop start was under a bar away: song time passed 8.
    // Read right after, which is a little later than the fire.
    expect(before.songTime).toBeLessThan(8);
    expect((await calls.snapshot([])).songTime).toBeGreaterThan(7.9);
    expect(result.sync).toMatch(/^starts in \d+(\.\d)?s, when t8\/s3 loops$/);
    await expectInSync(before, quantization);
  });

  it("syncs when the global quantization is none", async () => {
    await calls.setGlobalQuantization(NO_QUANTIZATION);
    await calls.startLoop(REFERENCE);
    await sleep(500);

    const quantization = await calls.clipValue(FIRED, "launch_quantization");
    const before = await calls.snapshot([REFERENCE]);
    const { result } = await fireSynced();

    expect(result.sync).toMatch(/^starts in /);
    await expectInSync(before, quantization);
  });

  it("refuses when the playing loops don't restart together", async () => {
    await calls.setGlobalQuantization(ONE_BAR);
    await calls.startLoop(REFERENCE);
    await sleep(300);
    // Lands on the next bar line, 4 beats on from the first loop
    await calls.startLoop(THIRD);
    await calls.waitFor(() => calls.isClipPlaying(THIRD));

    const refused = await calls.playbackSynced(FIRED);

    expect(isToolError(refused)).toBe(true);
    expect(getToolErrorMessage(refused)).toContain("loop out of step");
    expect(await calls.isClipPlaying(FIRED)).toBe(false);
    expect(await calls.clipValue(FIRED, "is_triggered")).toBe(0);
  });
});
