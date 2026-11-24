// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for ppal-create-clip auto, which drives Live's real transport:
 * play-clip fires only the new clip, play-scene fires the whole scene.
 * Uses: e2e-test-set (t8 is empty; s0 already holds clips on t0-t5)
 * See: e2e/live-sets/specs/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- clip/create/ppal-create-clip-auto
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getToolWarnings,
  parseToolResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import {
  loopDistance,
  ONE_BAR,
  restartError,
  type Slot,
  syncedLaunchCalls,
} from "../../control/helpers/synced-launch-test-helpers.ts";

const ctx = setupMcpTestContext();
const calls = syncedLaunchCalls(ctx);

interface CreatedClip {
  id: string;
}

interface ReadClipResult {
  id: string;
  playing?: boolean;
  triggered?: boolean;
}

async function createClip(path: string, auto?: string): Promise<CreatedClip> {
  return parseToolResult<CreatedClip>(
    await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path,
        notes: "C3 1|1",
        length: "1bar",
        ...(auto && { auto }),
      },
    }),
  );
}

async function readClip(id: string): Promise<ReadClipResult> {
  return parseToolResult<ReadClipResult>(
    await ctx.client!.callTool({ name: "ppal-read-clip", arguments: { id } }),
  );
}

/**
 * s1 also holds a clip on t3, so the neighbor says whether the transport fired
 * just the new clip or the whole scene.
 * @returns t3's session clips
 */
async function readNeighborClips(): Promise<ReadClipResult[]> {
  const track = parseToolResult<{ sessionClips?: ReadClipResult[] }>(
    await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { path: "t3", include: ["session-clips"] },
    }),
  );

  return track.sessionClips!;
}

/**
 * Create a clip with an `auto` action and read it back once Live has acted.
 * @param auto - The ppal-create-clip auto action
 * @returns The created clip, as read back
 */
async function createAndFire(auto: string): Promise<ReadClipResult> {
  const created = await createClip(`t${EMPTY_MIDI_TRACK}/s1`, auto);

  await sleep(300);

  return readClip(created.id);
}

describe("ppal-create-clip auto", () => {
  afterEach(async () => {
    await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: { action: "stop" },
    });
  });

  it("fires just the new clip with play-clip", async () => {
    const clip = await createAndFire("play-clip");

    expect(clip.playing || clip.triggered).toBe(true);

    // A scene launch would have caught the neighbor too
    const t3Clip = (await readNeighborClips()).find((c) => c.id !== clip.id);

    expect(t3Clip?.playing).toBeUndefined();
    expect(t3Clip?.triggered).toBeUndefined();
  });

  it("fires the whole scene with play-scene", async () => {
    const clip = await createAndFire("play-scene");

    expect(clip.playing || clip.triggered).toBe(true);

    // The point of play-scene is that the neighbors start too
    const t3Clip = (await readNeighborClips())[0]!;

    expect(t3Clip.playing || t3Clip.triggered).toBe(true);
  });

  // auto launches clip slots, so a call that made none says it did nothing.
  it("warns that auto did nothing for an arrangement-only call", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}[941|1]`,
        notes: "C3 1|1",
        length: "1bar",
        auto: "play-scene",
      },
    });

    expect(getToolWarnings(result)).toStrictEqual([
      "WARNING: auto ignored: it launches clip slots, and none got a clip",
    ]);
  });

  it("leaves the transport alone without auto", async () => {
    const created = await createClip(`t${EMPTY_MIDI_TRACK}/s1`);

    await sleep(300);

    const clip = await readClip(created.id);

    expect(clip.playing).toBeUndefined();
    expect(clip.triggered).toBeUndefined();
  });
});

// play-clip-synced brings the new clip in at the next loop start of the clips
// already playing. Loops are 2 bars (8 beats) at 108 BPM; t8/s3 is the
// reference and t3/s3 gets the new clip.
describe("ppal-create-clip auto: play-clip-synced", () => {
  const REFERENCE: Slot = { track: EMPTY_MIDI_TRACK, scene: 3 };
  const NEW_CLIP: Slot = { track: 3, scene: 3 };
  const LENGTH = 8;
  let globalQuantization: number | undefined;

  beforeEach(async () => {
    await setConfig({ liveApiEnabled: true });
    globalQuantization = await calls.readGlobalQuantization();
    await calls.setGlobalQuantization(ONE_BAR);
    await calls.makeLoop(REFERENCE, "2bars");
  });

  afterEach(async () => {
    await calls.stopAll();

    if (globalQuantization != null) {
      await calls.setGlobalQuantization(globalQuantization);
    }
  });

  it("starts the new clip with the playing loop, which keeps playing", async () => {
    await calls.startLoop(REFERENCE);
    await sleep(500);

    const before = await calls.snapshot([REFERENCE]);
    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${NEW_CLIP.track}/s${NEW_CLIP.scene}`,
        notes: "C3 1|1",
        length: "2bars",
        looping: true,
        auto: "play-clip-synced",
      },
    });

    expect(getToolWarnings(result)).toStrictEqual([]);
    await calls.waitFor(() => calls.isClipPlaying(NEW_CLIP));

    const after = await calls.snapshot([REFERENCE, NEW_CLIP]);

    expect(
      loopDistance(after.positions[0]!, after.positions[1]!, LENGTH),
    ).toBeLessThan(0.05);
    expect(restartError(before, after, 0, LENGTH)).toBeLessThan(0.15);
  });

  it("makes the clip and fires it plainly when nothing is playing", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${NEW_CLIP.track}/s${NEW_CLIP.scene}`,
        notes: "C3 1|1",
        length: "2bars",
        auto: "play-clip-synced",
      },
    });

    expect(getToolWarnings(result)).toStrictEqual([]);
    await calls.waitFor(() => calls.isClipPlaying(NEW_CLIP));
  });
});
