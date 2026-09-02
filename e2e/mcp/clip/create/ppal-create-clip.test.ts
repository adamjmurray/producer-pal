// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-create-clip tool
 * Creates MIDI and audio clips in session and arrangement views.
 * Uses: e2e-test-set - tests create clips in empty slots (t8 is empty MIDI track)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  type CreateTrackResult,
  getToolWarnings,
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  SAMPLE_FILE,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import {
  createAndRead,
  expectedSampleLength,
  readSongTiming,
} from "../helpers/audio-warp-test-helpers.ts";
import { AUDIO_TRACK, EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

describe("ppal-create-clip", () => {
  it("creates session MIDI clips with various properties", async () => {
    // Test 1: Create session MIDI clip (minimal params)
    const minimalResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}/s0`,
      },
    });
    const minimal = parseToolResult<CreateClipResult>(minimalResult);

    expect(minimal.id).toBeDefined();
    expect(typeof minimal.id).toBe("string");

    // Verify clip exists
    await sleep(100);
    const verifyMinimal = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: minimal.id },
    });
    const minimalClip = parseToolResult<ReadClipResult>(verifyMinimal);

    expect(minimalClip.type).toBe("midi");
    expect(minimalClip.view).toBe("session");
    expect(minimalClip.path).toBe(`t${EMPTY_MIDI_TRACK}/s0`);

    // Test 2: Create session clip with notes
    const notesResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}/s1`,
        notes: "C3 D3 E3 1|1",
      },
    });
    const notes = parseToolResult<CreateClipResult>(notesResult);

    expect(notes.id).toBeDefined();

    await sleep(100);
    const verifyNotes = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: notes.id, include: ["notes"] },
    });
    const notesClip = parseToolResult<ReadClipResult>(verifyNotes);

    expect(notesClip.notes).toContain("C3");

    // Test 3: Create clip with name
    const namedResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}/s2`,
        name: "Test Clip",
      },
    });
    const named = parseToolResult<CreateClipResult>(namedResult);

    await sleep(100);
    const verifyNamed = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: named.id },
    });
    const namedClip = parseToolResult<ReadClipResult>(verifyNamed);

    expect(namedClip.name).toBe("Test Clip");

    // Test 4: Create clip with color
    const colorResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}/s3`,
        color: "#FF0000",
      },
    });
    const colored = parseToolResult<CreateClipResult>(colorResult);

    await sleep(100);
    const verifyColored = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: colored.id, include: ["color"] },
    });
    const coloredClip = parseToolResult<ReadClipResult>(verifyColored);

    // Color may be quantized to Live's palette, but should be set
    expect(coloredClip.color).toBeDefined();

    // Test 5: Create clip with length
    const lengthResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}/s4`,
        length: "2bar",
      },
    });
    const lengthClip = parseToolResult<CreateClipResult>(lengthResult);

    await sleep(100);
    const verifyLength = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: lengthClip.id, include: ["timing"] },
    });
    const readLengthClip = parseToolResult<ReadClipResult>(verifyLength);

    expect(readLengthClip.length).toBe("2bar");

    // Test 6: Create clip with looping enabled
    const loopingResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}/s5`,
        looping: true,
      },
    });
    const loopingClip = parseToolResult<CreateClipResult>(loopingResult);

    await sleep(100);
    const verifyLooping = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: loopingClip.id, include: ["timing"] },
    });
    const readLoopingClip = parseToolResult<ReadClipResult>(verifyLooping);

    expect(readLoopingClip.looping).toBe(true);

    // Test 7: Create clip with time signature (use t7 Racks track which has no clips)
    const timeSigResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: "t7/s0",
        timeSignature: "3/4",
      },
    });
    const timeSigClip = parseToolResult<CreateClipResult>(timeSigResult);

    await sleep(100);
    const verifyTimeSig = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: timeSigClip.id, include: ["timing"] },
    });
    const readTimeSigClip = parseToolResult<ReadClipResult>(verifyTimeSig);

    expect(readTimeSigClip.timeSignature).toBe("3/4");
  });

  // trackIndex/sceneIndex are hidden aliases, not published params: a model
  // that reaches for them gets the clip it asked for plus a nudge toward path,
  // instead of an error and a second round trip.
  it("still creates a clip from the trackIndex/sceneIndex fallback", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        trackIndex: EMPTY_MIDI_TRACK,
        sceneIndex: 8,
        notes: "C3 1|1",
      },
    });
    const { data: clip } =
      parseToolResultWithWarnings<CreateClipResult>(result);

    expect(clip.id).toBeDefined();
    expect(clip.path).toBe(`t${EMPTY_MIDI_TRACK}/s8`);
    expect(getToolWarnings(result)).toContainEqual(
      expect.stringContaining('the parameter is "path"'),
    );
  });

  it("creates arrangement MIDI clips", async () => {
    // Test: Create arrangement clip
    const arrangementResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}`,
        arrangementStart: "41|1",
      },
    });
    const arrangement = parseToolResult<CreateClipResult>(arrangementResult);

    expect(arrangement.id).toBeDefined();

    await sleep(100);
    const verifyArrangement = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: arrangement.id },
    });
    const arrangementClip = parseToolResult<ReadClipResult>(verifyArrangement);

    expect(arrangementClip.view).toBe("arrangement");
    expect(arrangementClip.arrangementStart).toBe("41|1");
  });

  it("creates multiple clips in batch", async () => {
    // Test 1: Create multiple session clips with name (use t10 Child track which has no clips)
    const multiSessionResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: "t10/s2,t10/s3,t10/s4",
        name: "Batch Clip",
      },
    });
    const multiSession =
      parseToolResult<CreateClipResult[]>(multiSessionResult);

    expect(multiSession).toHaveLength(3);
    expect(multiSession[0]?.id).toBeDefined();
    expect(multiSession[1]?.id).toBeDefined();
    expect(multiSession[2]?.id).toBeDefined();

    // Verify all clips have the same name
    await sleep(100);

    for (const clip of multiSession) {
      const readClip = await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { id: clip.id },
      });

      expect(parseToolResult<{ name: string }>(readClip).name).toBe(
        "Batch Clip",
      );
    }

    // Test 2: Create multiple arrangement clips (use empty positions)
    const multiArrangementResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}`,
        arrangementStart: "45|1,49|1,53|1",
      },
    });
    const multiArrangement = parseToolResult<CreateClipResult[]>(
      multiArrangementResult,
    );

    expect(multiArrangement).toHaveLength(3);

    // Verify positions
    await sleep(100);
    const verifyFirst = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: multiArrangement[0]!.id },
    });
    const firstClip = parseToolResult<ReadClipResult>(verifyFirst);

    expect(firstClip.arrangementStart).toBe("45|1");
  });

  it("creates audio clips", async () => {
    // Setup: Create an audio track for audio clip tests
    const audioTrackResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "audio", name: "Audio Test Track" },
    });
    const audioTrack = parseToolResult<CreateTrackResult>(audioTrackResult);

    expect(audioTrack.path).toMatch(/^t\d+$/);

    await sleep(100);

    // Test 1: Create audio clip in session view
    const audioSessionResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `${audioTrack.path}/s0`,
        sampleFile: SAMPLE_FILE,
      },
    });
    const audioSession = parseToolResult<CreateClipResult>(audioSessionResult);

    expect(audioSession.id).toBeDefined();

    await sleep(100);
    const verifyAudioSession = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: audioSession.id },
    });
    const audioSessionClip =
      parseToolResult<ReadClipResult>(verifyAudioSession);

    expect(audioSessionClip.type).toBe("audio");
    expect(audioSessionClip.view).toBe("session");

    // Test 2: Create audio clip in arrangement view
    const audioArrangementResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `${audioTrack.path}`,
        arrangementStart: "17|1",
        sampleFile: SAMPLE_FILE,
      },
    });
    const audioArrangement = parseToolResult<CreateClipResult>(
      audioArrangementResult,
    );

    expect(audioArrangement.id).toBeDefined();

    await sleep(100);
    const verifyAudioArrangement = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: audioArrangement.id },
    });
    const audioArrangementClip = parseToolResult<ReadClipResult>(
      verifyAudioArrangement,
    );

    expect(audioArrangementClip.type).toBe("audio");
    expect(audioArrangementClip.view).toBe("arrangement");
    expect(audioArrangementClip.arrangementStart).toBe("17|1");

    // Test 3: Create audio clip with name and color
    const audioNamedResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `${audioTrack.path}/s1`,
        sampleFile: SAMPLE_FILE,
        name: "Named Audio Clip",
        color: "#00FF00",
      },
    });
    const audioNamed = parseToolResult<CreateClipResult>(audioNamedResult);

    await sleep(100);
    const verifyAudioNamed = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: audioNamed.id, include: ["color"] },
    });
    const audioNamedClip = parseToolResult<ReadClipResult>(verifyAudioNamed);

    expect(audioNamedClip.type).toBe("audio");
    expect(audioNamedClip.name).toBe("Named Audio Clip");
    expect(audioNamedClip.color).toBeDefined();
  });
});

// ============================================================================
// Audio clip warping on the create path. The update path is covered in
// update/ppal-update-clip-audio-warp.test.ts; the shared setup and the reason
// these assertions look the way they do are in the helpers module.
// ============================================================================

describe("ppal-create-clip audio warping", () => {
  it("lands an unwarped clip whose region is the sample, not the raw seconds", async () => {
    const song = await readSongTiming(ctx.client!);
    const { created, clip } = await createAndRead(ctx.client!, {
      path: `t${AUDIO_TRACK}/s6`,
      name: "unwarped one shot",
      warping: false,
    });

    expect(created.warping).toBe(false);
    expect(clip.type).toBe("audio");
    expect(clip.warping).toBe(false);

    // Reading the second-valued markers as beats would report tempo/60 times
    // too little — for a ~1s sample at 108bpm, a little over half
    expect(clip.length).toBe(expectedSampleLength(clip, song));
    // create-clip and read-clip must agree about the same clip
    expect(created.length).toBe(clip.length);
  });

  it("agrees with Live's own arrangement length when unwarped", async () => {
    // arrangementLength comes from Live's end_time - start_time, computed
    // without reference to the marker properties. The two must match.
    const { clip } = await createAndRead(ctx.client!, {
      path: `t${AUDIO_TRACK}`,
      arrangementStart: "33|1",
      name: "unwarped arrangement",
      warping: false,
    });

    expect(clip.warping).toBe(false);
    expect(clip.arrangementLength).toBeDefined();
    expect(clip.length).toBe(clip.arrangementLength);
  });

  it("lands a warped clip when warping is requested", async () => {
    const song = await readSongTiming(ctx.client!);
    const { created, clip } = await createAndRead(ctx.client!, {
      path: `t${AUDIO_TRACK}/s7`,
      name: "warped",
      warping: true,
    });

    expect(created.warping).toBe(true);
    expect(clip.warping).toBe(true);

    // Live maps every marker from seconds into beats when warp goes on, so the
    // region still spans the whole sample. Assert the exact length — a bare
    // "not empty" check would pass on a region Live had stretched or truncated.
    expect(clip.start).toBe("1|1");
    expect(clip.length).toBe(expectedSampleLength(clip, song));
  });
});
