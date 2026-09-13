// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-read-clip tool
 * Uses: e2e-test-set with pre-populated clips
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  parseAliasedToolResult,
  isToolError,
  parseBatchResult,
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  type SkippedTargetResult,
  setupMcpTestContext,
} from "../mcp-test-helpers";
import { arrangementStartOf } from "./helpers/arrangement-start-test-helpers.ts";

// Use once: true since we're only reading pre-populated clips
const ctx = setupMcpTestContext({ once: true });

describe("ppal-read-clip", () => {
  it("reads MIDI clips with various properties", async () => {
    // Test 1: Read MIDI clip by position (t0/s0 "Beat" - looping drum pattern)
    const midiResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: {
        path: "t0/s0",
        include: ["timing", "notes"],
      },
    });
    const midiClip = parseToolResult<ReadClipResult>(midiResult);

    expect(midiClip.id).toBeDefined();
    expect(midiClip.type).toBe("midi");
    expect(midiClip.name).toBe("Beat");
    expect(midiClip.view).toBe("session");
    expect(midiClip.looping).toBe(true);
    expect(midiClip.length).toBe("1bar");
    expect(midiClip.path).toBe("t0/s0");
    expect(midiClip.notes).toBeDefined();

    // Test 2: Read the same clip by id, spelled the way a model guesses it.
    // "clipId" is a permanent alias, so this checks the read and the steer.
    const byIdResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: midiClip.id! },
    });
    const byIdClip = parseAliasedToolResult<ReadClipResult>(
      byIdResult,
      "clipId",
      "id",
    );

    expect(byIdClip.id).toBe(midiClip.id);
    expect(byIdClip.name).toBe("Beat");

    // Test 3: Read non-looping MIDI clip (t2/s0 "Chords")
    const nonLoopingResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { path: "t2/s0", include: ["timing"] },
    });
    const nonLoopingClip = parseToolResult<ReadClipResult>(nonLoopingResult);

    expect(nonLoopingClip.name).toBe("Chords");
    expect(nonLoopingClip.looping).toBe(false);

    // Test 4: Read with include: ["notes"] - verify notes string present
    const withNotesResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { path: "t0/s0", include: ["notes"] },
    });
    const withNotesClip = parseToolResult<ReadClipResult>(withNotesResult);

    expect(withNotesClip.notes).toBeDefined();
    // Should contain drum pad notes (C1, D1 etc for kick/snare)
    expect(withNotesClip.notes).toMatch(/[CD]1/);

    // Test 5: Read with include: ["color"] - verify hex color format
    const withColorResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { path: "t0/s0", include: ["color"] },
    });
    const withColorClip = parseToolResult<ReadClipResult>(withColorResult);

    expect(withColorClip.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("reads audio clips with warp and pitch properties", async () => {
    // Test 1: Read warped audio clip (t4/s0 "sample" - warped, looping)
    const warpedResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: {
        path: "t4/s0",
        include: ["timing", "warp"],
      },
    });
    const warpedClip = parseToolResult<ReadClipResult>(warpedResult);

    expect(warpedClip.type).toBe("audio");
    expect(warpedClip.name).toBe("sample");
    expect(warpedClip.looping).toBe(true);
    expect(warpedClip.warping).toBe(true);
    expect(warpedClip.warpMode).toBe("beats");

    // Test 2: Read unwarped, pitch-shifted audio clip (t5/s0 "sample copy")
    const unwarpedResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: {
        path: "t5/s0",
        include: ["timing", "sample", "warp"],
      },
    });
    const unwarpedClip = parseToolResult<ReadClipResult>(unwarpedResult);

    expect(unwarpedClip.type).toBe("audio");
    expect(unwarpedClip.name).toBe("sample copy");
    expect(unwarpedClip.looping).toBe(false);
    expect(unwarpedClip.warping).toBe(false);
    expect(unwarpedClip.pitchShift).toBe(7); // +7 semitones per spec
    expect(unwarpedClip.gainDb).toBeCloseTo(-2.31, 1);
  });

  it("reads arrangement clips", async () => {
    // Read arrangement clip from t0 at position 1|1 ("Arr Beat")
    // First get the clip ID from reading the track's arrangement clips
    const trackResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { path: "t0", include: ["arrangement-clips"] },
    });
    const track = parseToolResult<TrackWithClips>(trackResult);

    expect(track.arrangementClips).toBeDefined();
    expect(track.arrangementClips!.length).toBeGreaterThan(0);

    const arrClipId = track.arrangementClips![0]!.id;
    const arrResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: arrClipId, include: ["timing"] },
    });
    const arrClip = parseToolResult<ReadClipResult>(arrResult);

    expect(arrClip.view).toBe("arrangement");
    expect(arrangementStartOf(arrClip)).toBe("1|1");
    expect(arrClip.arrangementLength).toBeDefined();
  });

  it("reads clips with offset loops", async () => {
    // Test offset loop: t3/s1 has start=2|1, loopStart=1|1
    const offsetResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { path: "t3/s1", include: ["timing"] },
    });
    const offsetClip = parseToolResult<ReadClipResult>(offsetResult);

    expect(offsetClip.start).toBe("2|1");
    expect(offsetClip.looping).toBe(true);
    expect(offsetClip.type).toBe("midi");

    // Test firstStart: t4/s0 has firstStart≠start per spec
    const warpResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: {
        path: "t4/s0",
        include: ["warp", "timing"],
      },
    });
    const warpClip = parseToolResult<ReadClipResult>(warpResult);

    // firstStart is only included when it differs from start
    expect(typeof warpClip.firstStart).toBe("string");
  });

  it("handles empty slots and errors correctly", async () => {
    // Test 1: Read empty slot (t8 is empty track with no clips)
    const emptyResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { path: "t8/s0" },
    });
    const { data: emptyClip, warnings } =
      parseToolResultWithWarnings<ReadClipResult>(emptyResult);

    expect(emptyClip.id).toBeNull();
    expect(emptyClip.type).toBeNull();
    expect(emptyClip.path).toBe("t8/s0");

    // Verify warning is emitted for empty slot
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBe("WARNING: no clip at t8/s0");

    // Test 2: Non-existent scene throws error
    const invalidSceneResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { path: "t0/s999" },
    });

    expect(isToolError(invalidSceneResult)).toBe(true);
    expect(getToolErrorMessage(invalidSceneResult)).toContain(
      'no scene at "s999"',
    );

    // Test 3: Non-existent track throws error
    const invalidTrackResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { path: "t999/s0" },
    });

    expect(isToolError(invalidTrackResult)).toBe(true);
    expect(getToolErrorMessage(invalidTrackResult)).toContain(
      'no track at "t999"',
    );
  });
});

describe("ppal-read-clip compact notation", () => {
  it("produces comma merging and fraction durations", async () => {
    // t0/s0 "Beat" — drum pattern: C1 kick on 1,3; D1 snare on 2,4
    const result = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { path: "t0/s0", include: ["notes"] },
    });
    const clip = parseToolResult<ReadClipResult>(result);
    const notes = clip.notes!;

    // Note-value (n<fraction>) duration for the short drum hits
    expect(notes).toMatch(/n\/16/);
    // Comma-merged beats (e.g. 1|1,3 for kicks on beats 1 and 3)
    expect(notes).toMatch(/\d\|[\d.]+,[\d.]+/);
    expect(notes).toContain("C1");
    expect(notes).toContain("D1");
  });

  it("formats probability as decimal", async () => {
    // t2/s0 "Chords" — Am chord, one note has p=0.69
    const result = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { path: "t2/s0", include: ["notes"] },
    });
    const clip = parseToolResult<ReadClipResult>(result);
    const notes = clip.notes!;

    // Probability uses decimal format, not fraction
    expect(notes).toMatch(/p0\.69/);
    expect(notes).not.toMatch(/p\d*\/\d+/);
  });
});

describe("ppal-read-clip drum spelling", () => {
  it("spells a clip the same read alone as read in a batch", async () => {
    // Whether a track holds a drum rack is worked out once per request, so a
    // read spanning t0 (a Drum Rack) and t2 (Analog, no drum rack) is where one
    // track's answer could reach the other's notes. A clip read on its own
    // shares nothing, so it says what each spelling should be.
    //
    // t2/s0 "Chords" is the clip that can tell: it stacks Am on one beat, and
    // grouping by pitch puts each of those on its own line where grouping by
    // time keeps them together. A clip with one note per pitch AND one per beat
    // — t0/s0 and t1/s0 both — spells the same either way and proves nothing.
    // A scene read walks tracks in index order, so t0 always answers first;
    // t2 is the one a shared answer would reach.
    const notesOf = async (path: string) =>
      parseToolResult<ReadClipResult>(
        await ctx.client!.callTool({
          name: "ppal-read-clip",
          arguments: { path, include: ["notes"] },
        }),
      ).notes;

    const drums = await notesOf("t0/s0");
    const chords = await notesOf("t2/s0");

    expect(drums).toBeDefined();
    // Two pitches side by side is the melodic spelling and only the melodic
    // spelling: grouping by pitch gives each of them a line of its own. Pinning
    // the shape rather than the string keeps this about the grouping.
    expect(chords).toMatch(/[A-G][b#]?-?\d+ [A-G][b#]?-?\d+/);

    const scene = parseToolResult<SceneWithClipNotes>(
      await ctx.client!.callTool({
        name: "ppal-read-scene",
        arguments: { path: "s0", include: ["clips", "notes"] },
      }),
    );
    const inScene = (path: string) =>
      scene.clips?.find((clip) => clip.path === path)?.notes;

    expect(inScene("t0/s0")).toBe(drums);
    expect(inScene("t2/s0")).toBe(chords);
  });
});

describe("ppal-read-clip over a list of targets", () => {
  const readClips = (args: Record<string, unknown>) =>
    ctx.client!.callTool({ name: "ppal-read-clip", arguments: args });

  it("returns one entry per path, in the order named", async () => {
    const clips = parseBatchResult<ReadClipResult>(
      await readClips({ path: "t2/s0,t0/s0,t1/s0" }),
      3,
    );

    expect(clips.map((clip) => clip.path)).toStrictEqual([
      "t2/s0",
      "t0/s0",
      "t1/s0",
    ]);
    expect(clips.map((clip) => clip.name)).toStrictEqual([
      "Chords",
      "Beat",
      "Bassline",
    ]);
  });

  it("reads ids and paths together, ids first", async () => {
    const beat = parseToolResult<ReadClipResult>(
      await readClips({ path: "t0/s0" }),
    );
    const clips = parseBatchResult<ReadClipResult>(
      await readClips({ id: beat.id!, path: "t2/s0" }),
      2,
    );

    expect(clips[0]!.id).toBe(beat.id);
    expect(clips[1]!.path).toBe("t2/s0");
    expect(clips.map((clip) => clip.name)).toStrictEqual(["Beat", "Chords"]);
  });

  it("keeps a slot for an empty clip slot and reads the rest", async () => {
    // t8 holds no clips. A lone read of an empty slot warns instead; in a list
    // the entry carries it, and parseBatchResult throws on any warning.
    const entries = parseBatchResult<ReadClipResult | SkippedTargetResult>(
      await readClips({ path: "t0/s0,t8/s0,t1/s0" }),
      3,
    );

    expect(entries).toStrictEqual([
      expect.objectContaining({ path: "t0/s0", name: "Beat" }),
      { path: "t8/s0", ok: false, reason: "no clip at t8/s0" },
      expect.objectContaining({ path: "t1/s0", name: "Bassline" }),
    ]);
  });

  it("unwraps a single target", async () => {
    const clip = parseToolResult<ReadClipResult>(
      await readClips({ path: "t0/s0" }),
    );

    expect(Array.isArray(clip)).toBe(false);
    expect(clip.path).toBe("t0/s0");
  });
});

interface SceneWithClipNotes {
  clips?: Array<{ path?: string; notes?: string }>;
}

interface TrackWithClips {
  arrangementClips?: Array<{ id: string; position: string; length: string }>;
}
