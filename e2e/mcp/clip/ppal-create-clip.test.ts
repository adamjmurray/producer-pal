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
import { abletonBeatsToDuration } from "#src/notation/barbeat/time/barbeat-time.ts";
import {
  type CreateClipResult,
  type CreateTrackResult,
  parseToolResult,
  type ReadClipResult,
  SAMPLE_FILE,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

// Use t8 "9-MIDI" which is empty in e2e-test-set
const emptyMidiTrack = 8;

describe("ppal-create-clip", () => {
  it("creates session MIDI clips with various properties", async () => {
    // Test 1: Create session MIDI clip (minimal params)
    const minimalResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${emptyMidiTrack}/0`,
      },
    });
    const minimal = parseToolResult<CreateClipResult>(minimalResult);

    expect(minimal.id).toBeDefined();
    expect(typeof minimal.id).toBe("string");

    // Verify clip exists
    await sleep(100);
    const verifyMinimal = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: minimal.id },
    });
    const minimalClip = parseToolResult<ReadClipResult>(verifyMinimal);

    expect(minimalClip.type).toBe("midi");
    expect(minimalClip.view).toBe("session");
    expect(minimalClip.slot).toBe(`${emptyMidiTrack}/0`);

    // Test 2: Create session clip with notes
    const notesResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${emptyMidiTrack}/1`,
        notes: "C3 D3 E3 1|1",
      },
    });
    const notes = parseToolResult<CreateClipResult>(notesResult);

    expect(notes.id).toBeDefined();

    await sleep(100);
    const verifyNotes = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: notes.id, include: ["notes"] },
    });
    const notesClip = parseToolResult<ReadClipResult>(verifyNotes);

    expect(notesClip.notes).toContain("C3");

    // Test 3: Create clip with name
    const namedResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${emptyMidiTrack}/2`,
        name: "Test Clip",
      },
    });
    const named = parseToolResult<CreateClipResult>(namedResult);

    await sleep(100);
    const verifyNamed = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: named.id },
    });
    const namedClip = parseToolResult<ReadClipResult>(verifyNamed);

    expect(namedClip.name).toBe("Test Clip");

    // Test 4: Create clip with color
    const colorResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${emptyMidiTrack}/3`,
        color: "#FF0000",
      },
    });
    const colored = parseToolResult<CreateClipResult>(colorResult);

    await sleep(100);
    const verifyColored = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: colored.id, include: ["color"] },
    });
    const coloredClip = parseToolResult<ReadClipResult>(verifyColored);

    // Color may be quantized to Live's palette, but should be set
    expect(coloredClip.color).toBeDefined();

    // Test 5: Create clip with length
    const lengthResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${emptyMidiTrack}/4`,
        length: "2bar",
      },
    });
    const lengthClip = parseToolResult<CreateClipResult>(lengthResult);

    await sleep(100);
    const verifyLength = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: lengthClip.id, include: ["timing"] },
    });
    const readLengthClip = parseToolResult<ReadClipResult>(verifyLength);

    expect(readLengthClip.length).toBe("2bar");

    // Test 6: Create clip with looping enabled
    const loopingResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${emptyMidiTrack}/5`,
        looping: true,
      },
    });
    const loopingClip = parseToolResult<CreateClipResult>(loopingResult);

    await sleep(100);
    const verifyLooping = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: loopingClip.id, include: ["timing"] },
    });
    const readLoopingClip = parseToolResult<ReadClipResult>(verifyLooping);

    expect(readLoopingClip.looping).toBe(true);

    // Test 7: Create clip with time signature (use t7 Racks track which has no clips)
    const timeSigResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: "7/0",
        timeSignature: "3/4",
      },
    });
    const timeSigClip = parseToolResult<CreateClipResult>(timeSigResult);

    await sleep(100);
    const verifyTimeSig = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: timeSigClip.id, include: ["timing"] },
    });
    const readTimeSigClip = parseToolResult<ReadClipResult>(verifyTimeSig);

    expect(readTimeSigClip.timeSignature).toBe("3/4");
  });

  it("creates arrangement MIDI clips", async () => {
    // Test: Create arrangement clip
    const arrangementResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        trackIndex: emptyMidiTrack,
        arrangementStart: "41|1",
      },
    });
    const arrangement = parseToolResult<CreateClipResult>(arrangementResult);

    expect(arrangement.id).toBeDefined();

    await sleep(100);
    const verifyArrangement = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: arrangement.id },
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
        slot: "10/2,10/3,10/4",
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
        arguments: { clipId: clip.id },
      });

      expect(parseToolResult<{ name: string }>(readClip).name).toBe(
        "Batch Clip",
      );
    }

    // Test 2: Create multiple arrangement clips (use empty positions)
    const multiArrangementResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        trackIndex: emptyMidiTrack,
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
      arguments: { clipId: multiArrangement[0]!.id },
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

    expect(audioTrack.trackIndex).toBeDefined();

    await sleep(100);

    // Test 1: Create audio clip in session view
    const audioSessionResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${audioTrack.trackIndex}/0`,
        sampleFile: SAMPLE_FILE,
      },
    });
    const audioSession = parseToolResult<CreateClipResult>(audioSessionResult);

    expect(audioSession.id).toBeDefined();

    await sleep(100);
    const verifyAudioSession = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: audioSession.id },
    });
    const audioSessionClip =
      parseToolResult<ReadClipResult>(verifyAudioSession);

    expect(audioSessionClip.type).toBe("audio");
    expect(audioSessionClip.view).toBe("session");

    // Test 2: Create audio clip in arrangement view
    const audioArrangementResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        trackIndex: audioTrack.trackIndex,
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
      arguments: { clipId: audioArrangement.id },
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
        slot: `${audioTrack.trackIndex}/1`,
        sampleFile: SAMPLE_FILE,
        name: "Named Audio Clip",
        color: "#00FF00",
      },
    });
    const audioNamed = parseToolResult<CreateClipResult>(audioNamedResult);

    await sleep(100);
    const verifyAudioNamed = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: audioNamed.id, include: ["color"] },
    });
    const audioNamedClip = parseToolResult<ReadClipResult>(verifyAudioNamed);

    expect(audioNamedClip.type).toBe("audio");
    expect(audioNamedClip.name).toBe("Named Audio Clip");
    expect(audioNamedClip.color).toBeDefined();
  });
});

// ============================================================================
// Audio clip warping
//
// Live decides for itself whether to warp an imported sample, following the
// user's "Loop/Warp Short Samples" setting -- which the Live API can neither
// read nor set. So these tests never assert what an *unspecified* `warping`
// produces; they pin the explicit values and the timing that must follow.
//
// The substance is unit handling: Live reports an audio clip's markers in beats
// while it is warped and in seconds once it is not, so an unwarped clip's
// region is only right if that switch is honored. Live's own
// `end_time - start_time`, surfaced as `arrangementLength`, is the oracle.
//
// t5 "Audio 2" is an audio track with s6/s7 free and no arrangement clips.
// ============================================================================

const audioWarpTrack = 5;

interface SongTiming {
  tempo: number;
  numerator: number;
  denominator: number;
}

/**
 * Read the Set's tempo and meter, rather than hardcoding them, so the test
 * survives an edit to the test set.
 * @returns The Set's tempo and time signature
 */
async function readSongTiming(): Promise<SongTiming> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-live-set",
    arguments: {},
  });
  const liveSet = parseToolResult<{ tempo: number; timeSignature: string }>(
    result,
  );
  const [numerator, denominator] = liveSet.timeSignature.split("/").map(Number);

  return {
    tempo: liveSet.tempo,
    numerator: numerator as number,
    denominator: denominator as number,
  };
}

/**
 * The duration an unwarped clip covering the whole sample must report.
 * @param clip - A clip read with the sample and warp includes
 * @param song - The Set's tempo and meter
 * @returns The expected bar|beat duration string
 */
function expectedSampleLength(clip: ReadClipResult, song: SongTiming): string {
  const sampleSeconds = clip.sampleLength! / clip.sampleRate!;

  return abletonBeatsToDuration(
    (sampleSeconds * song.tempo) / 60,
    song.numerator,
    song.denominator,
  );
}

/**
 * Create an audio clip and read it back with every include.
 * @param args - ppal-create-clip arguments, merged over the shared sampleFile
 * @returns The create result and the clip as read back
 */
async function createAndRead(
  args: Record<string, unknown>,
): Promise<{ created: CreateClipResult; clip: ReadClipResult }> {
  const createResult = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: { sampleFile: SAMPLE_FILE, ...args },
  });
  const created = parseToolResult<CreateClipResult>(createResult);

  expect(created.id).toBeDefined();

  await sleep(100);

  const readResult = await ctx.client!.callTool({
    name: "ppal-read-clip",
    arguments: { clipId: created.id, include: ["*"] },
  });

  return { created, clip: parseToolResult<ReadClipResult>(readResult) };
}

describe("ppal-create-clip audio warping", () => {
  it("lands an unwarped clip whose region is the sample, not the raw seconds", async () => {
    const song = await readSongTiming();
    const { created, clip } = await createAndRead({
      slot: `${audioWarpTrack}/6`,
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
    const { clip } = await createAndRead({
      trackIndex: audioWarpTrack,
      arrangementStart: "33|1",
      name: "unwarped arrangement",
      warping: false,
    });

    expect(clip.warping).toBe(false);
    expect(clip.arrangementLength).toBeDefined();
    expect(clip.length).toBe(clip.arrangementLength);
  });

  it("lands a warped clip when warping is requested", async () => {
    const song = await readSongTiming();
    const { created, clip } = await createAndRead({
      slot: `${audioWarpTrack}/7`,
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

  it("survives an unwarp then re-warp without inflating the region", async () => {
    // The two directions are asymmetric: Live maps the markers on the way in
    // but leaves end_marker stale on the way out, which is why unwarpAudioClip
    // restates it. Skip that restatement and this second pass maps a beat value
    // that is already in beats, stretching the clip by tempo/60.
    const song = await readSongTiming();
    const { created } = await createAndRead({
      trackIndex: audioWarpTrack,
      arrangementStart: "49|1",
      name: "warp round trip",
      warping: false,
    });

    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: created.id, warping: true },
    });
    await sleep(100);

    const readResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: created.id, include: ["*"] },
    });
    const clip = parseToolResult<ReadClipResult>(readResult);

    expect(clip.warping).toBe(true);
    expect(clip.length).toBe(expectedSampleLength(clip, song));
  });
});
