// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-playback tool
 * Tests playback control across arrangement and session views.
 * Uses: e2e-test-set (t8 is empty, s0 is "Intro", s7 is unnamed,
 * locators Intro 1|1, Verse 9|1, Chorus 17|1, Bridge 33|1)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- control/ppal-playback
 */
import { describe, expect, it } from "vitest";
import {
  isToolError,
  getToolErrorMessage,
  getToolWarnings,
  parseToolResult,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";
import { CHILD_TRACK, EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext();

async function playback(
  args: Record<string, unknown>,
): Promise<PlaybackResult> {
  return parseToolResult<PlaybackResult>(
    await ctx.client!.callTool({ name: "ppal-playback", arguments: args }),
  );
}

/**
 * Check the next call reports the loop the write before it left. A write
 * answers with the state from before itself, so only a later call can see it.
 * @param loopStart - Expected loop start
 * @param loopEnd - Expected loop end
 */
async function expectLoopReadsBack(
  loopStart: string,
  loopEnd: string,
): Promise<void> {
  const playing = await playback({ action: "play-arrangement" });

  expect(playing.loop).toBe(true);
  expect(playing.loopStart).toBe(loopStart);
  expect(playing.loopEnd).toBe(loopEnd);
}

async function createSessionClip(
  sceneIndex: number,
  note: string,
): Promise<string> {
  return createClipOnTrack(EMPTY_MIDI_TRACK, sceneIndex, note);
}

async function createClipOnTrack(
  trackIndex: number,
  sceneIndex: number,
  note: string,
): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: {
      path: `t${trackIndex}/s${sceneIndex}`,
      notes: `${note} 1|1`,
      length: "1bar",
    },
  });

  return parseToolResult<{ id: string }>(result).id;
}

async function readClip(
  path: string,
): Promise<{ playing?: boolean; triggered?: boolean }> {
  return parseToolResult<{ playing?: boolean; triggered?: boolean }>(
    await ctx.client!.callTool({ name: "ppal-read-clip", arguments: { path } }),
  );
}

describe("ppal-playback", () => {
  it("reports the stopped state", async () => {
    const stopped = await playback({ action: "stop" });

    expect(stopped.playing).toBe(false);
  });

  it("keeps the start position across a stop, and says nothing about it", async () => {
    await playback({ action: "play-arrangement", startTime: "5|1" });
    await sleep(100);

    const stopped = await playback({ action: "stop" });

    // Nothing moved it, so nothing reports it.
    expect(stopped.playing).toBe(false);
    expect(stopped.startTime).toBeUndefined();

    // Live's second press of stop sends the start position to the top. Two
    // more stops, then the only thing that reports the position: it survived.
    await playback({ action: "stop" });
    await sleep(100);
    await playback({ action: "stop" });

    const playing = await playback({ action: "play-arrangement" });

    expect(playing.startTime).toBe("5|1");

    await playback({ action: "stop" });
  });

  it("plays the arrangement from wherever the start position is", async () => {
    await playback({ action: "update-arrangement", startTime: "5|1" });

    const playing = await playback({ action: "play-arrangement" });

    // No startTime given, so it plays from the position already set — and
    // reports it, because the caller may never have read it.
    expect(playing.playing).toBe(true);
    expect(playing.startTime).toBe("5|1");

    await playback({ action: "stop" });
  });

  it("plays the arrangement from a bar|beat position", async () => {
    const playFrom = await playback({
      action: "play-arrangement",
      startTime: "5|1",
    });

    expect(playFrom.playing).toBe(true);
    expect(playFrom.startTime).toBe("5|1");

    await playback({ action: "stop" });
  });

  it("sets the arrangement start position without moving the playhead", async () => {
    const set = await playback({
      action: "update-arrangement",
      startTime: "9|1",
    });

    // Where the next play begins, which is the whole point of the call. The
    // playhead doesn't move, and isn't reported: Live updates it too late for
    // this request to read it back.
    expect(set.startTime).toBe("9|1");
    expect(set.playing).toBe(false);

    await playback({ action: "stop" });
  });

  it("sets the arrangement loop, and a later call reads it back", async () => {
    const looped = await playback({
      action: "update-arrangement",
      loop: true,
      loopStart: "3|1",
      loopEnd: "7|1",
    });

    // The call said all three, so the result says none of them back. Nothing
    // moved the start position either, so nothing reports it.
    expect(looped.loop).toBeUndefined();
    expect(looped.loopStart).toBeUndefined();
    expect(looped.loopEnd).toBeUndefined();
    expect(looped.startTime).toBeUndefined();

    // Only a second call can see the write land: `live_set loop` answers a read
    // in the request that wrote it with the value from before the write.
    await expectLoopReadsBack("3|1", "7|1");

    const stopped = await playback({ action: "stop" });

    expect(stopped.playing).toBe(false);

    // The next test writes the loop and reads it back, so this cleanup has to
    // land: a write issued right after a stop gets clobbered.
    await sleep(100);
    await playback({ action: "update-arrangement", loop: false });
  });

  // The regression this guards: the loop came back read from the Live Set in
  // the call that wrote it, so every answer was the state of the call before.
  // Each write says nothing back, and the call after it answers with what that
  // write left. The first write establishes the loop this test reads, so it
  // never inherits one — a failure partway skips the cleanup at the bottom.
  it("reports the loop the last call left, not the one before it", async () => {
    const turnedOn = await playback({
      action: "update-arrangement",
      loop: true,
    });

    expect(turnedOn.loop).toBeUndefined();

    const on = await playback({ action: "play-arrangement" });

    expect(on.loop).toBe(true);

    // Let the transport calls land: a write issued right after a stop gets
    // clobbered, the same way the stop in the test below moves a start
    // position that was written before it.
    await sleep(100);
    await playback({ action: "stop" });
    await sleep(100);

    const turnedOff = await playback({
      action: "update-arrangement",
      loop: false,
    });

    expect(turnedOff.loop).toBeUndefined();

    const off = await playback({ action: "play-arrangement" });

    expect(off.loop).toBe(false);

    await sleep(100);
    await playback({ action: "stop" });
  });

  it("parks a start position on stop and plays from it next time", async () => {
    await playback({ action: "play-arrangement", startTime: "5|1" });
    await sleep(100);

    // The write has to land after the transport call: Live's own second stop
    // sends the start position to the top, so writing it first would be wiped.
    const stopped = await playback({ action: "stop", startTime: "9|1" });

    expect(stopped.playing).toBe(false);
    expect(stopped.startTime).toBe("9|1");

    const playing = await playback({ action: "play-arrangement" });

    expect(playing.startTime).toBe("9|1");

    await playback({ action: "stop" });
  });

  it("turns the arrangement loop on when only its bounds are named", async () => {
    const looped = await playback({
      action: "update-arrangement",
      loopStart: "3|1",
      loopEnd: "7|1",
    });

    // Both ends came from the call, and so did the loop they turned on.
    expect(looped.loop).toBeUndefined();
    expect(looped.loopStart).toBeUndefined();
    expect(looped.loopEnd).toBeUndefined();

    await expectLoopReadsBack("3|1", "7|1");

    await playback({ action: "stop" });
    await playback({ action: "update-arrangement", loop: false });
  });

  it("slides the whole loop when only one end is named", async () => {
    await playback({
      action: "update-arrangement",
      loopStart: "3|1",
      loopEnd: "7|1",
    });

    // Like dragging the loop brace in Live: it keeps its length and moves.
    const slid = await playback({
      action: "update-arrangement",
      loopEnd: "9|1",
    });

    // The end the caller named isn't repeated; the one that moved with it is
    // the only thing the result reveals.
    expect(slid.loopStart).toBe("5|1");
    expect(slid.loopEnd).toBeUndefined();

    await playback({ action: "update-arrangement", loop: false });
  });

  it("refuses an inverted loop whole, leaving the loop off", async () => {
    await playback({
      action: "update-arrangement",
      loop: false,
      loopStart: "3|1",
      loopEnd: "7|1",
    });

    const refused = await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: {
        action: "update-arrangement",
        loopStart: "9|1",
        loopEnd: "5|1",
      },
    });

    // Writing the start and then refusing the length would leave a loop nobody
    // asked for, and turn it on to boot.
    expect(getToolWarnings(refused)).toContain(
      "WARNING: loopEnd 5|1 is not after loopStart 9|1 — leaving the loop as it was",
    );

    // The refusal left the loop off, which only a later call can show.
    const after = await playback({ action: "play-arrangement" });

    expect(after.loop).toBe(false);

    await playback({ action: "stop" });
  });

  it("reports the loop it refused to change, which the playback obeys", async () => {
    await playback({
      action: "update-arrangement",
      loop: true,
      loopStart: "3|1",
      loopEnd: "7|1",
    });

    // The refusal warns, so this one can't go through the plain helper.
    const refused = await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: {
        action: "play-arrangement",
        loopStart: "9|1",
        loopEnd: "5|1",
      },
    });

    expect(getToolWarnings(refused)).toContain(
      "WARNING: loopEnd 5|1 is not after loopStart 9|1 — leaving the loop as it was",
    );

    const { data } = parseToolResultWithWarnings<PlaybackResult>(refused);

    // Nothing was written, so the loop this playback obeys is still the old
    // one — and saying so is the only way the caller learns where it is.
    expect(data.loop).toBe(true);
    expect(data.loopStart).toBe("3|1");
    expect(data.loopEnd).toBe("7|1");

    await sleep(100);
    await playback({ action: "stop" });
    await playback({ action: "update-arrangement", loop: false });
  });

  it("says nothing about the loop when the call didn't touch it", async () => {
    const set = await playback({
      action: "update-arrangement",
      startTime: "5|1",
    });

    expect(set.startTime).toBe("5|1");
    expect(set.loop).toBeUndefined();
  });

  it("plays and stops session clips", async () => {
    const clip1 = await createSessionClip(0, "C3");
    const clip2 = await createSessionClip(1, "D3");

    await sleep(100);

    const playingClips = await playback({
      action: "play-session-clips",
      id: `${clip1},${clip2}`,
    });

    expect(playingClips.playing).toBe(true);
    // Only play-scene fires a scene, so a clip action names none
    expect(playingClips.scene).toBeUndefined();
    // A session action leaves the arrangement start position alone, so it
    // isn't in the result either.
    expect(playingClips.startTime).toBeUndefined();

    await sleep(100);
    await playback({ action: "stop-session-clips", id: clip1 });
    await playback({ action: "stop-all-session-clips" });

    const final = await playback({ action: "stop" });

    expect(final.playing).toBe(false);
  });

  // The clip actions act on a set, so id and path both name members of it.
  // The two clips have to sit on different tracks: a track plays one clip at a
  // time, so same-track targets would just replace each other.
  it("plays the clips named by id and by path together", async () => {
    const byId = await createSessionClip(0, "C3");

    await createClipOnTrack(CHILD_TRACK, 0, "D3");
    await sleep(100);

    await playback({
      action: "play-session-clips",
      id: byId,
      path: `t${CHILD_TRACK}/s0`,
    });

    await sleep(300);

    const [first, second] = await Promise.all([
      readClip(`t${EMPTY_MIDI_TRACK}/s0`),
      readClip(`t${CHILD_TRACK}/s0`),
    ]);

    expect(first.playing ?? first.triggered).toBe(true);
    expect(second.playing ?? second.triggered).toBe(true);

    await playback({ action: "stop-all-session-clips" });
    await playback({ action: "stop" });
  });

  it("plays a scene by path", async () => {
    const playingScene = await playback({
      action: "play-scene",
      path: "s0",
    });

    expect(playingScene.playing).toBe(true);
    expect(playingScene.scene?.path).toBe("s0");
    expect(playingScene.scene?.name).toBe("Intro");

    await playback({ action: "stop" });
  });

  it("plays the scene a clip sits in", async () => {
    // A clip id names the scene it sits in, and the response is the only way
    // the caller learns which scene that was
    const clip = await createSessionClip(0, "C3");

    await sleep(100);

    const byClip = await playback({ action: "play-scene", id: clip });

    expect(byClip.scene?.id).toMatch(/\S/);
    expect(byClip.scene?.path).toBe("s0");
    expect(byClip.scene?.name).toBe("Intro");

    await playback({ action: "stop" });
  });

  it("names an unnamed scene by its number, as Live shows it", async () => {
    const unnamed = await playback({ action: "play-scene", path: "s7" });

    expect(unnamed.scene?.path).toBe("s7");
    expect(unnamed.scene?.name).toBe("8");

    await playback({ action: "stop" });
  });

  it("starts the arrangement from a locator named by the user", async () => {
    const playing = await playback({
      action: "play-arrangement",
      startTime: "loc:Verse",
    });

    expect(playing.playing).toBe(true);
    expect(playing.startTime).toBe("9|1");

    await playback({ action: "stop" });
  });

  it("starts the arrangement from a locator id", async () => {
    const playing = await playback({
      action: "play-arrangement",
      startTime: "loc:locator-2",
    });

    expect(playing.startTime).toBe("17|1");

    await playback({ action: "stop" });
  });

  it("sets the arrangement loop from locators", async () => {
    const looped = await playback({
      action: "update-arrangement",
      loop: true,
      loopStart: "loc:Verse",
      loopEnd: "loc:Chorus",
    });

    // The call named both ends, so the result names neither.
    expect(looped.loopStart).toBeUndefined();
    expect(looped.startTime).toBeUndefined();

    // Where the locators resolved to, read back by a later call.
    const playing = await playback({ action: "play-arrangement" });

    expect(playing.loopStart).toBe("9|1");
    expect(playing.loopEnd).toBe("17|1");

    await playback({ action: "stop" });
    await playback({ action: "update-arrangement", loop: false });
  });

  it("sets the arrangement start position from a locator", async () => {
    const set = await playback({
      action: "update-arrangement",
      startTime: "loc:Chorus",
    });

    expect(set.startTime).toBe("17|1");

    await playback({ action: "stop" });
  });

  it("errors on a locator name nothing matches", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: { action: "play-arrangement", startTime: "loc:Nowhere" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      'no locator found with name "Nowhere"',
    );
  });
});

interface PlaybackResult {
  playing: boolean;
  startTime?: string;
  scene?: { id: string; path?: string; name: string };
  loop?: boolean;
  loopStart?: string;
  loopEnd?: string;
}
