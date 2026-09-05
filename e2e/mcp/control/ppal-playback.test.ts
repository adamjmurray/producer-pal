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

  it("sets the arrangement loop", async () => {
    const looped = await playback({
      action: "update-arrangement",
      loop: true,
      loopStart: "3|1",
      loopEnd: "7|1",
    });

    expect(looped.loop).toBe(true);
    expect(looped.loopStart).toBe("3|1");
    expect(looped.loopEnd).toBe("7|1");
    // Nothing moved the start position, so nothing reports it.
    expect(looped.startTime).toBeUndefined();

    const stopped = await playback({ action: "stop" });

    expect(stopped.playing).toBe(false);
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

    expect(looped.loop).toBe(true);
    expect(looped.loopStart).toBe("3|1");
    expect(looped.loopEnd).toBe("7|1");

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

    expect(slid.loopStart).toBe("5|1");
    expect(slid.loopEnd).toBe("9|1");

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

    const after = await playback({
      action: "update-arrangement",
      loopStart: "3|1",
    });

    expect(after.loop).toBe(false);

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

    expect(looped.loopStart).toBe("9|1");
    expect(looped.loopEnd).toBe("17|1");
    expect(looped.startTime).toBeUndefined();
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
