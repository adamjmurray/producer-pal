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
  getToolWarnings,
  isToolError,
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
} from "../mcp-test-helpers";

// Use once: true since we're only reading pre-populated clips
const ctx = setupMcpTestContext({ once: true });

describe("ppal-read-clip", () => {
  it("reads MIDI clips with various properties", async () => {
    // Test 1: Read MIDI clip by position (t0/s0 "Beat" - looping drum pattern)
    const midiResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { trackIndex: 0, sceneIndex: 0 },
    });
    const midiClip = parseToolResult<ReadClipResult>(midiResult);

    expect(midiClip.id).toBeDefined();
    expect(midiClip.type).toBe("midi");
    expect(midiClip.name).toBe("Beat");
    expect(midiClip.view).toBe("session");
    expect(midiClip.looping).toBe(true);
    expect(midiClip.length).toBe("1:0");
    expect(midiClip.trackIndex).toBe(0);
    expect(midiClip.sceneIndex).toBe(0);
    expect(midiClip.noteCount).toBeGreaterThan(0);

    // Test 2: Read clip by clipId
    const byIdResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: midiClip.id! },
    });
    const byIdClip = parseToolResult<ReadClipResult>(byIdResult);

    expect(byIdClip.id).toBe(midiClip.id);
    expect(byIdClip.name).toBe("Beat");

    // Test 3: Read non-looping MIDI clip (t2/s0 "Chords")
    const nonLoopingResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { trackIndex: 2, sceneIndex: 0 },
    });
    const nonLoopingClip = parseToolResult<ReadClipResult>(nonLoopingResult);

    expect(nonLoopingClip.name).toBe("Chords");
    expect(nonLoopingClip.looping).toBe(false);

    // Test 4: Read with include: ["clip-notes"] - verify notes string present
    const withNotesResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { trackIndex: 0, sceneIndex: 0, include: ["clip-notes"] },
    });
    const withNotesClip = parseToolResult<ReadClipResult>(withNotesResult);

    expect(withNotesClip.notes).toBeDefined();
    // Should contain drum pad notes (C1, D1 etc for kick/snare)
    expect(withNotesClip.notes).toMatch(/[CD]1/);

    // Test 5: Read with include: ["color"] - verify hex color format
    const withColorResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { trackIndex: 0, sceneIndex: 0, include: ["color"] },
    });
    const withColorClip = parseToolResult<ReadClipResult>(withColorResult);

    expect(withColorClip.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("reads audio clips with warp and pitch properties", async () => {
    // Test 1: Read warped audio clip (t4/s0 "sample" - warped, looping)
    const warpedResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { trackIndex: 4, sceneIndex: 0 },
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
      arguments: { trackIndex: 5, sceneIndex: 0 },
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
      arguments: { trackIndex: 0, include: ["arrangement-clips"] },
    });
    const track = parseToolResult<TrackWithClips>(trackResult);

    expect(track.arrangementClips).toBeDefined();
    expect(track.arrangementClips!.length).toBeGreaterThan(0);

    const arrClipId = track.arrangementClips![0]!.id;
    const arrResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: arrClipId },
    });
    const arrClip = parseToolResult<ReadClipResult>(arrResult);

    expect(arrClip.view).toBe("arrangement");
    expect(arrClip.arrangementStart).toBe("1|1");
    expect(arrClip.arrangementLength).toBeDefined();
  });

  it("handles empty slots and errors correctly", async () => {
    // Test 1: Read empty slot (t8 is empty track with no clips)
    const emptyResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { trackIndex: 8, sceneIndex: 0 },
    });
    const emptyClip = parseToolResult<ReadClipResult>(emptyResult);

    expect(emptyClip.id).toBeNull();
    expect(emptyClip.type).toBeNull();
    expect(emptyClip.trackIndex).toBe(8);
    expect(emptyClip.sceneIndex).toBe(0);

    // Verify warning is emitted for empty slot
    const warnings = getToolWarnings(emptyResult);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBe("WARNING: no clip at trackIndex 8, sceneIndex 0");

    // Test 2: Non-existent scene throws error
    const invalidSceneResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { trackIndex: 0, sceneIndex: 999 },
    });

    expect(isToolError(invalidSceneResult)).toBe(true);
    expect(getToolErrorMessage(invalidSceneResult)).toContain(
      "sceneIndex 999 does not exist",
    );

    // Test 3: Non-existent track throws error
    const invalidTrackResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { trackIndex: 999, sceneIndex: 0 },
    });

    expect(isToolError(invalidTrackResult)).toBe(true);
    expect(getToolErrorMessage(invalidTrackResult)).toContain(
      "trackIndex 999 does not exist",
    );
  });
});

interface TrackWithClips {
  arrangementClips?: Array<{ id: string; position: string; length: string }>;
}
