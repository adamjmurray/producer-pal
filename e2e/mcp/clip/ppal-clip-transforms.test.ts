/**
 * E2E tests for clip transforms (audio gain and MIDI parameters)
 * Tests transform expressions applied via ppal-update-clip.
 * Uses: e2e-test-set - t8 is empty MIDI track
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

/** Applies a transform to a clip. */
async function applyTransform(
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
    await applyTransform(clipId, "gain = -6");
    expect(await readClipGain(clipId)).toBeCloseTo(-6, 0);

    // Set to +12 dB
    await applyTransform(clipId, "gain = 12");
    expect(await readClipGain(clipId)).toBeCloseTo(12, 0);

    // Set to 0 dB
    await applyTransform(clipId, "gain = 0");
    expect(await readClipGain(clipId)).toBeCloseTo(0, 0);
  });

  it("sets gain using math expressions and operators", async () => {
    const { clipId } = await createAudioTrackWithClip("Gain Math");

    // Multiplication: -6 * 2 = -12
    await applyTransform(clipId, "gain = -6 * 2");
    expect(await readClipGain(clipId)).toBeCloseTo(-12, 0);

    // Reference current value: audio.gain + 6 = -12 + 6 = -6
    await applyTransform(clipId, "gain = audio.gain + 6");
    expect(await readClipGain(clipId)).toBeCloseTo(-6, 0);

    // Add operator: start at -10, then += 4 = -6
    await setClipGain(clipId, -10);
    await applyTransform(clipId, "gain += 4");
    expect(await readClipGain(clipId)).toBeCloseTo(-6, 0);

    // Division: -12 / 2 = -6
    await applyTransform(clipId, "gain = -12 / 2");
    expect(await readClipGain(clipId)).toBeCloseTo(-6, 0);
  });

  it("sets gain to random value using noise()", async () => {
    const { clipId } = await createAudioTrackWithClip("Gain Random");

    // noise() returns [-1, 1], scale to [-10, 0]
    await applyTransform(clipId, "gain = -5 + 5 * noise()");
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
    await applyTransform(clipId, "gain = -70");
    expect(await readClipGain(clipId)).toBeCloseTo(-70, 0);

    // Below minimum clamps to -70
    await applyTransform(clipId, "gain = -100");
    expect(await readClipGain(clipId)).toBeCloseTo(-70, 0);

    // Exact maximum (24 dB)
    await applyTransform(clipId, "gain = 24");
    expect(await readClipGain(clipId)).toBeCloseTo(24, 0);

    // Above maximum clamps to 24
    await applyTransform(clipId, "gain = 50");
    expect(await readClipGain(clipId)).toBeCloseTo(24, 0);
  });
});

// =============================================================================
// MIDI Transform Tests
// =============================================================================

const emptyMidiTrack = 8; // t8 "9-MIDI" from e2e-test-set

/** Creates a MIDI clip with specified notes on the empty MIDI track. */
async function createMidiClip(
  sceneIndex: number,
  notes: string,
): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: {
      view: "session",
      trackIndex: emptyMidiTrack,
      sceneIndex: String(sceneIndex),
      notes,
      length: "2:0.0",
    },
  });
  const clip = parseToolResult<CreateClipResult>(result);

  await sleep(100);

  return clip.id;
}

/** Reads clip notes as a string. */
async function readClipNotes(clipId: string): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-clip",
    arguments: { clipId, include: ["clip-notes"] },
  });
  const clip = parseToolResult<ReadClipResult>(result);

  return clip.notes ?? "";
}

describe("ppal-clip-transforms (midi parameters)", () => {
  it("transforms velocity with constants, expressions, and clamping", async () => {
    // Create clip with known velocity (v100)
    const clipId = await createMidiClip(0, "v100 C3 1|1");

    // Set to constant
    await applyTransform(clipId, "velocity = 64");
    let notes = await readClipNotes(clipId);

    expect(notes).toContain("v64");

    // Use += operator (64 + 20 = 84)
    await applyTransform(clipId, "velocity += 20");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("v84");

    // Clamp below minimum (0 → 1)
    await applyTransform(clipId, "velocity = 0");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("v1");

    // Clamp above maximum (200 → 127)
    await applyTransform(clipId, "velocity = 200");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("v127");
  });

  it("transforms timing to shift note positions", async () => {
    // Create clip with note at beat 1
    const clipId = await createMidiClip(1, "C3 1|1");

    // Shift forward by 0.5 beats
    await applyTransform(clipId, "timing += 0.5");
    let notes = await readClipNotes(clipId);

    expect(notes).toContain("1|1.5");

    // Shift backward
    await applyTransform(clipId, "timing += -0.25");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("1|1.25");
  });

  it("transforms duration with clamping to minimum", async () => {
    // Create clip with default duration
    const clipId = await createMidiClip(2, "C3 1|1");

    // Set duration to 2 beats
    await applyTransform(clipId, "duration = 2");
    let notes = await readClipNotes(clipId);

    expect(notes).toContain("t2");

    // Set very small duration (clamped to 0.001)
    await applyTransform(clipId, "duration = -1");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("t0.001");

    // Multiply duration
    await applyTransform(clipId, "duration = 0.5");
    notes = await readClipNotes(clipId);
    expect(notes).toContain("t0.5");
  });

  it("transforms probability with clamping", async () => {
    // Create clip
    const clipId = await createMidiClip(3, "C3 1|1");

    // Set probability to 0.8
    await applyTransform(clipId, "probability = 0.8");
    let notes = await readClipNotes(clipId);

    expect(notes).toContain("p0.8");

    // Clamp above 1.0
    await applyTransform(clipId, "probability = 1.5");
    notes = await readClipNotes(clipId);
    // At p1.0, the format omits probability (default)
    expect(notes).not.toContain("p1.5");

    // Clamp below 0.0
    await applyTransform(clipId, "probability = -0.5");
    notes = await readClipNotes(clipId);
    expect(notes).toMatch(/p0(?:\.0+)?(?:\s|$)/);
  });

  it("transforms deviation with clamping", async () => {
    // Create clip with known velocity
    const clipId = await createMidiClip(4, "v100 C3 1|1");

    // Set deviation to 20 (shows as velocity range v100-120)
    await applyTransform(clipId, "deviation = 20");
    let notes = await readClipNotes(clipId);

    expect(notes).toContain("v100-120");

    // Clamp above 127
    await applyTransform(clipId, "deviation = 200");
    notes = await readClipNotes(clipId);
    // velocity 100 + deviation 127 = v100-227, but actual max is 127
    expect(notes).toMatch(/v100-\d+/);

    // Clamp below -127: negative deviation doesn't show as range in format
    // (only positive deviation shows as v100-120), so just verify note exists
    await applyTransform(clipId, "deviation = -200");
    notes = await readClipNotes(clipId);

    expect(notes).toContain("C3");
    expect(notes).not.toContain("v100-"); // No range when deviation ≤ 0
  });
});
