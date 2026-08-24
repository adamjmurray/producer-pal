// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared helpers for the audio clip warping e2e tests.
 *
 * Live decides for itself whether to warp an imported sample, following the
 * user's "Loop/Warp Short Samples" setting -- which the Live API can neither
 * read nor set. So these tests never assert what an *unspecified* `warping`
 * produces; they pin the explicit values and the timing that must follow.
 *
 * The substance is unit handling: Live reports an audio clip's markers in beats
 * while it is warped and in seconds once it is not, so a clip's region is only
 * right if that switch is honored. Live's own `end_time - start_time`, surfaced
 * as `arrangementLength`, is the oracle for an arrangement clip.
 *
 * t5 "Audio 2" is an audio track with s1-s7 free and no arrangement clips.
 */
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { expect } from "vitest";
import { abletonBeatsToDuration } from "#src/notation/barbeat/time/barbeat-time.ts";
import {
  type CreateClipResult,
  DRUM_LOOP_FILE,
  parseToolResult,
  type ReadClipResult,
  SAMPLE_FILE,
  sleep,
} from "../../mcp-test-helpers.ts";

/** t5 "Audio 2": an audio track with free slots and an empty arrangement. */
export const AUDIO_WARP_TRACK = 5;

export interface SongTiming {
  tempo: number;
  numerator: number;
  denominator: number;
}

/**
 * Read the Set's tempo and meter, rather than hardcoding them, so the tests
 * survive an edit to the test set.
 * @param client - The MCP client
 * @returns The Set's tempo and time signature
 */
export async function readSongTiming(client: Client): Promise<SongTiming> {
  const result = await client.callTool({
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
 * The whole sample's duration in real Ableton beats at the Set tempo.
 * @param clip - A clip read with the sample include
 * @param song - The Set's tempo and meter
 * @returns The sample duration in beats
 */
export function sampleBeats(clip: ReadClipResult, song: SongTiming): number {
  return ((clip.sampleLength! / clip.sampleRate!) * song.tempo) / 60;
}

/**
 * The duration a clip covering the whole sample must report.
 * @param clip - A clip read with the sample and warp includes
 * @param song - The Set's tempo and meter
 * @returns The expected bar|beat duration string
 */
export function expectedSampleLength(
  clip: ReadClipResult,
  song: SongTiming,
): string {
  return abletonBeatsToDuration(
    sampleBeats(clip, song),
    song.numerator,
    song.denominator,
  );
}

/**
 * Read a clip back with every include.
 * @param client - The MCP client
 * @param clipId - The clip to read
 * @returns The clip as read back
 */
export async function readClipFully(
  client: Client,
  clipId: string,
): Promise<ReadClipResult> {
  const result = await client.callTool({
    name: "ppal-read-clip",
    arguments: { id: clipId, include: ["*"] },
  });

  return parseToolResult<ReadClipResult>(result);
}

/**
 * The drum loop's real length in beats: 98000 frames at 44100 Hz is 2.2222
 * seconds, which is exactly 4 beats at the test Set's 108 BPM.
 */
export const DRUM_LOOP_BEATS = 4;

/**
 * Create an unwarped drum-loop clip in a clip slot.
 * @param client - The MCP client
 * @param path - The clip slot, "t<track>/s<scene>"
 * @returns The new clip's id
 */
export async function createUnwarpedDrumLoop(
  client: Client,
  path: string,
): Promise<string> {
  const result = await client.callTool({
    name: "ppal-create-clip",
    arguments: {
      sampleFile: DRUM_LOOP_FILE,
      path,
      name: "unwarped loop",
      warping: false,
    },
  });
  const created = parseToolResult<CreateClipResult>(result);

  await sleep(100);

  return created.id;
}

/**
 * Cut a drum-loop clip's region down to the first half bar.
 *
 * This is what makes an unwarped clip's length testable at all. Live's
 * `Clip.length` still reports the full bar afterwards — it never recomputes
 * once warping is off — so anything measuring the clip by `length` rather than
 * by its markers sees twice the region the clip actually plays.
 *
 * @param client - The MCP client
 * @param clipId - The clip to shorten
 */
export async function halveDrumLoopRegion(
  client: Client,
  clipId: string,
): Promise<void> {
  await client.callTool({
    name: "ppal-update-clip",
    arguments: { id: clipId, start: "1|1", length: "n/2" },
  });

  await sleep(100);
}

/**
 * Create an audio clip from the shared sample and read it back with every
 * include.
 * @param client - The MCP client
 * @param args - ppal-create-clip arguments, merged over the shared sampleFile
 * @returns The create result and the clip as read back
 */
export async function createAndRead(
  client: Client,
  args: Record<string, unknown>,
): Promise<{ created: CreateClipResult; clip: ReadClipResult }> {
  const createResult = await client.callTool({
    name: "ppal-create-clip",
    arguments: { sampleFile: SAMPLE_FILE, ...args },
  });
  const created = parseToolResult<CreateClipResult>(createResult);

  expect(created.id).toBeDefined();

  await sleep(100);

  return { created, clip: await readClipFully(client, created.id) };
}
