/**
 * E2E tests for ppal-create-clip tool
 * Creates MIDI and audio clips in session and arrangement views.
 *
 * Run with: npm run e2e:mcp
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

// Sample file for audio clip tests - resolve relative to this file's location
const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_FILE = resolve(
  __dirname,
  "../../../evals/live-sets/samples/sample.aiff",
);

describe("ppal-create-clip", () => {
  it(
    "creates clips of various types with different options",
    { timeout: 60000 },
    async () => {
      // Test 1: Create session MIDI clip (minimal params)
      const minimalResult = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          view: "session",
          trackIndex: 0,
          sceneIndex: "0",
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
      expect(minimalClip.trackIndex).toBe(0);
      expect(minimalClip.sceneIndex).toBe(0);

      // Test 2: Create session clip with notes
      const notesResult = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          view: "session",
          trackIndex: 0,
          sceneIndex: "1",
          notes: "C3 D3 E3 1|1",
        },
      });
      const notes = parseToolResult<CreateClipResult>(notesResult);

      expect(notes.id).toBeDefined();

      await sleep(100);
      const verifyNotes = await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { clipId: notes.id },
      });
      const notesClip = parseToolResult<ReadClipResult>(verifyNotes);

      expect(notesClip.noteCount).toBe(3);

      // Test 3: Create clip with name
      const namedResult = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          view: "session",
          trackIndex: 0,
          sceneIndex: "2",
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
          view: "session",
          trackIndex: 0,
          sceneIndex: "3",
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

      // Test 5: Create arrangement clip
      const arrangementResult = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          view: "arrangement",
          trackIndex: 0,
          arrangementStart: "1|1",
        },
      });
      const arrangement = parseToolResult<CreateClipResult>(arrangementResult);

      expect(arrangement.id).toBeDefined();

      await sleep(100);
      const verifyArrangement = await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { clipId: arrangement.id },
      });
      const arrangementClip =
        parseToolResult<ReadClipResult>(verifyArrangement);

      expect(arrangementClip.view).toBe("arrangement");
      expect(arrangementClip.arrangementStart).toBe("1|1");

      // Test 6: Create clip with length
      const lengthResult = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          view: "session",
          trackIndex: 1,
          sceneIndex: "0",
          length: "2:0.0",
        },
      });
      const lengthClip = parseToolResult<CreateClipResult>(lengthResult);

      await sleep(100);
      const verifyLength = await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { clipId: lengthClip.id },
      });
      const readLengthClip = parseToolResult<ReadClipResult>(verifyLength);

      expect(readLengthClip.length).toBe("2:0");

      // Test 7: Create clip with looping enabled
      const loopingResult = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          view: "session",
          trackIndex: 1,
          sceneIndex: "1",
          looping: true,
        },
      });
      const loopingClip = parseToolResult<CreateClipResult>(loopingResult);

      await sleep(100);
      const verifyLooping = await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { clipId: loopingClip.id },
      });
      const readLoopingClip = parseToolResult<ReadClipResult>(verifyLooping);

      expect(readLoopingClip.looping).toBe(true);

      // Test 8: Create multiple session clips
      const multiSessionResult = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          view: "session",
          trackIndex: 1,
          sceneIndex: "2,3,4",
        },
      });
      const multiSession =
        parseToolResult<CreateClipResult[]>(multiSessionResult);

      expect(multiSession).toHaveLength(3);
      expect(multiSession[0]?.id).toBeDefined();
      expect(multiSession[1]?.id).toBeDefined();
      expect(multiSession[2]?.id).toBeDefined();

      // Test 9: Create multiple arrangement clips
      const multiArrangementResult = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          view: "arrangement",
          trackIndex: 1,
          arrangementStart: "5|1,9|1,13|1",
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

      expect(firstClip.arrangementStart).toBe("5|1");

      // Test 10: Create clip with time signature
      const timeSigResult = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          view: "session",
          trackIndex: 2,
          sceneIndex: "0",
          timeSignature: "3/4",
        },
      });
      const timeSigClip = parseToolResult<CreateClipResult>(timeSigResult);

      await sleep(100);
      const verifyTimeSig = await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { clipId: timeSigClip.id },
      });
      const readTimeSigClip = parseToolResult<ReadClipResult>(verifyTimeSig);

      expect(readTimeSigClip.timeSignature).toBe("3/4");

      // --- Audio clip tests ---
      // First, create an audio track for audio clip tests
      const audioTrackResult = await ctx.client!.callTool({
        name: "ppal-create-track",
        arguments: { type: "audio", name: "Audio Test Track" },
      });
      const audioTrack = parseToolResult<CreateTrackResult>(audioTrackResult);

      expect(audioTrack.trackIndex).toBeDefined();

      await sleep(100);

      // Test 11: Create audio clip in session view
      const audioSessionResult = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          view: "session",
          trackIndex: audioTrack.trackIndex,
          sceneIndex: "0",
          sampleFile: SAMPLE_FILE,
        },
      });
      const audioSession =
        parseToolResult<CreateClipResult>(audioSessionResult);

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

      // Test 12: Create audio clip in arrangement view
      const audioArrangementResult = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          view: "arrangement",
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

      // Test 13: Create audio clip with name and color
      const audioNamedResult = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          view: "session",
          trackIndex: audioTrack.trackIndex,
          sceneIndex: "1",
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
    },
  );
});

interface CreateTrackResult {
  id: string;
  trackIndex?: number;
}

interface CreateClipResult {
  id: string;
}

interface ReadClipResult {
  id: string;
  type: "midi" | "audio";
  name?: string;
  view: "session" | "arrangement";
  color?: string;
  timeSignature?: string;
  looping?: boolean;
  start?: string;
  end?: string;
  length?: string;
  trackIndex?: number;
  sceneIndex?: number;
  arrangementStart?: string;
  arrangementLength?: string;
  noteCount?: number;
  notes?: string;
}
