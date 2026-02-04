/**
 * E2E tests for clip transforms (audio gain)
 * Tests transform expressions applied via ppal-update-clip.
 * Uses: e2e-test-set
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  type CreateTrackResult,
  parseToolResult,
  type ReadClipResult,
  SAMPLE_FILE,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";

const ctx = setupMcpTestContext();

/** Creates an audio track with a clip for testing. */
async function createAudioTrackWithClip(trackName: string): Promise<{
  trackIndex: number;
  clipId: string;
}> {
  const trackResult = await ctx.client!.callTool({
    name: "ppal-create-track",
    arguments: { type: "audio", name: trackName },
  });
  const track = parseToolResult<CreateTrackResult>(trackResult);

  await sleep(100);

  const clipResult = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: {
      view: "session",
      trackIndex: track.trackIndex,
      sceneIndex: "0",
      sampleFile: SAMPLE_FILE,
    },
  });
  const clip = parseToolResult<CreateClipResult>(clipResult);

  await sleep(100);

  return { trackIndex: track.trackIndex!, clipId: clip.id };
}

/** Reads clip and returns gainDb value. */
async function readClipGain(clipId: string): Promise<number> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-clip",
    arguments: { clipId, include: ["warp-markers"] },
  });
  const clip = parseToolResult<ReadClipResult>(result);

  return clip.gainDb!;
}

/** Applies a gain transform to a clip. */
async function applyGainTransform(
  clipId: string,
  transform: string,
): Promise<void> {
  await ctx.client!.callTool({
    name: "ppal-update-clip",
    arguments: { ids: clipId, transforms: transform },
  });
  await sleep(100);
}

/** Sets clip gain directly (not via transform). */
async function setClipGain(clipId: string, gainDb: number): Promise<void> {
  await ctx.client!.callTool({
    name: "ppal-update-clip",
    arguments: { ids: clipId, gainDb },
  });
  await sleep(100);
}

describe("ppal-clip-transforms (audio gain)", () => {
  it("sets gain to constant values", async () => {
    const { clipId } = await createAudioTrackWithClip("Gain Constants");

    // Set to -6 dB
    await applyGainTransform(clipId, "gain = -6");
    expect(await readClipGain(clipId)).toBeCloseTo(-6, 0);

    // Set to +12 dB
    await applyGainTransform(clipId, "gain = 12");
    expect(await readClipGain(clipId)).toBeCloseTo(12, 0);

    // Set to 0 dB
    await applyGainTransform(clipId, "gain = 0");
    expect(await readClipGain(clipId)).toBeCloseTo(0, 0);
  });

  it("sets gain using math expressions and operators", async () => {
    const { clipId } = await createAudioTrackWithClip("Gain Math");

    // Multiplication: -6 * 2 = -12
    await applyGainTransform(clipId, "gain = -6 * 2");
    expect(await readClipGain(clipId)).toBeCloseTo(-12, 0);

    // Reference current value: audio.gain + 6 = -12 + 6 = -6
    await applyGainTransform(clipId, "gain = audio.gain + 6");
    expect(await readClipGain(clipId)).toBeCloseTo(-6, 0);

    // Add operator: start at -10, then += 4 = -6
    await setClipGain(clipId, -10);
    await applyGainTransform(clipId, "gain += 4");
    expect(await readClipGain(clipId)).toBeCloseTo(-6, 0);

    // Division: -12 / 2 = -6
    await applyGainTransform(clipId, "gain = -12 / 2");
    expect(await readClipGain(clipId)).toBeCloseTo(-6, 0);
  });

  it("sets gain to random value using noise()", async () => {
    const { clipId } = await createAudioTrackWithClip("Gain Random");

    // noise() returns [-1, 1], scale to [-10, 0]
    await applyGainTransform(clipId, "gain = -5 + 5 * noise()");
    const gain = await readClipGain(clipId);

    expect(gain).toBeGreaterThanOrEqual(-10);
    expect(gain).toBeLessThanOrEqual(0);
  });

  it("applies transforms to multiple clips", async () => {
    const trackResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "audio", name: "Multi Clip Transforms" },
    });
    const track = parseToolResult<CreateTrackResult>(trackResult);

    await sleep(100);

    // Create two clips on different scenes
    const clip1Result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: track.trackIndex,
        sceneIndex: "0",
        sampleFile: SAMPLE_FILE,
      },
    });
    const clip1 = parseToolResult<CreateClipResult>(clip1Result);

    const clip2Result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: track.trackIndex,
        sceneIndex: "1",
        sampleFile: SAMPLE_FILE,
      },
    });
    const clip2 = parseToolResult<CreateClipResult>(clip2Result);

    await sleep(100);

    // Apply transform to both clips
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: `${clip1.id},${clip2.id}`, transforms: "gain = -9" },
    });
    await sleep(100);

    expect(await readClipGain(clip1.id)).toBeCloseTo(-9, 0);
    expect(await readClipGain(clip2.id)).toBeCloseTo(-9, 0);
  });

  it("clamps gain to valid range (-70 to 24 dB)", async () => {
    const { clipId } = await createAudioTrackWithClip("Gain Clamping");

    // Exact minimum (-70 dB)
    await applyGainTransform(clipId, "gain = -70");
    expect(await readClipGain(clipId)).toBeCloseTo(-70, 0);

    // Below minimum clamps to -70
    await applyGainTransform(clipId, "gain = -100");
    expect(await readClipGain(clipId)).toBeCloseTo(-70, 0);

    // Exact maximum (24 dB)
    await applyGainTransform(clipId, "gain = 24");
    expect(await readClipGain(clipId)).toBeCloseTo(24, 0);

    // Above maximum clamps to 24
    await applyGainTransform(clipId, "gain = 50");
    expect(await readClipGain(clipId)).toBeCloseTo(24, 0);
  });
});
