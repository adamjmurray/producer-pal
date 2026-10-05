// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for what ppal-playback refuses or skips before it acts: a bad
 * timeline, an empty clip slot, a scene id that doesn't name a scene.
 * Uses: e2e-test-set (t8 is empty, and s3 on it stays empty here; t9 "Parent"
 * is a group track and t10 "Child" is its member)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- control/ppal-playback-refusals
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";
import { CHILD_TRACK, EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";
import { playbackCalls } from "./helpers/playback-test-helpers.ts";

const ctx = setupMcpTestContext();
const {
  callPlayback,
  playback,
  isPlaying,
  clipPlaying,
  createClipOnTrack,
  createSessionClip,
} = playbackCalls(ctx);

/** t9 "Parent": the group track that holds t10 "Child". */
const PARENT_TRACK = CHILD_TRACK - 1;

describe("ppal-playback refusals", () => {
  // stop used to stop the transport and only then fail to read the position.
  it("leaves the transport playing when stop has a bad startTime", async () => {
    await playback({ action: "play-arrangement", startTime: "1|1" });
    await sleep(300);
    expect(await isPlaying()).toBe(true);

    const refused = await callPlayback({
      action: "stop",
      startTime: "garbage",
    });

    expect(isToolError(refused)).toBe(true);
    expect(getToolErrorMessage(refused)).toContain("Invalid bar|beat format");

    await sleep(300);
    expect(await isPlaying()).toBe(true);

    await playback({ action: "stop" });
  });

  // Firing an empty slot would stop the clip its track is playing.
  it("skips an empty slot and leaves the track's playing clip alone", async () => {
    await createSessionClip(0);
    await sleep(100);
    await playback({
      action: "play-session-clips",
      path: `t${EMPTY_MIDI_TRACK}/s0`,
    });
    await sleep(300);
    expect(await clipPlaying(`t${EMPTY_MIDI_TRACK}/s0`)).toBe(true);

    const refused = await callPlayback({
      action: "play-session-clips",
      path: `t${EMPTY_MIDI_TRACK}/s3`,
    });

    expect(isToolError(refused)).toBe(true);
    expect(getToolErrorMessage(refused)).toContain("no clip to play");

    await sleep(300);
    expect(await clipPlaying(`t${EMPTY_MIDI_TRACK}/s0`)).toBe(true);

    await playback({ action: "stop-all-session-clips" });
    await playback({ action: "stop" });
  });

  it("answers an empty slot with a skip entry beside the clips that fired", async () => {
    const clip = await createSessionClip(0);

    await sleep(100);

    const result = await playback({
      action: "play-session-clips",
      path: `t${EMPTY_MIDI_TRACK}/s3,t${EMPTY_MIDI_TRACK}/s0`,
    });

    expect(result.playing).toBe(true);
    expect(result.clip).toStrictEqual([
      {
        path: `t${EMPTY_MIDI_TRACK}/s3`,
        ok: false,
        detail: "no clip to play",
      },
      { id: clip, path: `t${EMPTY_MIDI_TRACK}/s0` },
    ]);

    await playback({ action: "stop-all-session-clips" });
    await playback({ action: "stop" });
  });

  // A group track's slot holds no clip, but firing it launches its children's.
  it("fires a group track's slot rather than skipping it", async () => {
    await createClipOnTrack(CHILD_TRACK, 0, "C3");
    await sleep(100);

    const result = await playback({
      action: "play-session-clips",
      path: `t${PARENT_TRACK}/s0`,
    });

    // No clip of its own, so the entry has a path and no id.
    expect(result.playing).toBe(true);
    expect(result.clip).toStrictEqual({ path: `t${PARENT_TRACK}/s0` });

    await sleep(300);
    expect(await clipPlaying(`t${CHILD_TRACK}/s0`)).toBe(true);

    await playback({ action: "stop-all-session-clips" });
    await playback({ action: "stop" });
  });

  it("errors with the id's own reason for a scene id that doesn't exist", async () => {
    const refused = await callPlayback({ action: "play-scene", id: "999999" });

    expect(isToolError(refused)).toBe(true);
    expect(getToolErrorMessage(refused)).toContain(
      'id "999999" does not exist',
    );
    expect(getToolErrorMessage(refused)).not.toContain("is required");
  });

  it("errors with its own reason for a play-scene id that is a track", async () => {
    const { id } = parseToolResult<{ id: string }>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { path: `t${EMPTY_MIDI_TRACK}` },
      }),
    );

    const refused = await callPlayback({ action: "play-scene", id });

    expect(isToolError(refused)).toBe(true);
    expect(getToolErrorMessage(refused)).toContain("is in no scene");
    expect(getToolErrorMessage(refused)).not.toContain("is required");
  });
});
