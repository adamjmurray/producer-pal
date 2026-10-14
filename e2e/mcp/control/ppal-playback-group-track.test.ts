// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for ppal-playback on a group track's slot: the entry says what it
 * did to the tracks inside. Uses: e2e-test-set, where t9 "Parent" is a group
 * whose only member is t10 "Child". A track made at t10 lands inside the group
 * and pushes Child down to t11.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- control/ppal-playback-group-track
 */
import { describe, expect, it } from "vitest";
import {
  type CreateTrackResult,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";
import { CHILD_TRACK, PARENT_TRACK } from "../e2e-test-set.ts";
import { playbackCalls } from "./helpers/playback-test-helpers.ts";

const ctx = setupMcpTestContext();
const { playback, clipPlaying, createClipOnTrack } = playbackCalls(ctx);

const GROUP_SLOT = `t${PARENT_TRACK}/s0`;
// The track the test adds to the group, and Child after it moves down.
const ADDED = CHILD_TRACK;
const CHILD = CHILD_TRACK + 1;

/**
 * Add a second track to the Parent group.
 * @returns The new track's id
 */
async function addMemberToGroup(): Promise<string> {
  const made = parseToolResult<CreateTrackResult>(
    await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { path: `t${ADDED}` },
    }),
  );

  expect(made.path).toBe(`t${ADDED}`);
  await sleep(100);

  return made.id;
}

/**
 * A track's id.
 * @param path - The track's path
 * @returns The id
 */
async function trackId(path: string): Promise<string> {
  return parseToolResult<{ id: string }>(
    await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { path },
    }),
  ).id;
}

/**
 * Wait for a clip to be stopped, which Live does at its launch quantization.
 * @param path - The clip slot's path
 */
async function waitUntilStopped(path: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (!(await clipPlaying(path))) {
      return;
    }

    await sleep(250);
  }

  throw new Error(`${path} never stopped`);
}

describe("ppal-playback on a group track's slot", () => {
  it("says which clips firing it launched and which tracks it stopped", async () => {
    const addedId = await addMemberToGroup();

    const childClip = await createClipOnTrack(CHILD, 0, "C3");

    // The added track has a clip in s1 only, and is playing it. Firing s0 on
    // the group has no clip for it, so it stops.
    await createClipOnTrack(ADDED, 1, "D3");
    await sleep(100);
    await playback({ action: "play-session-clips", path: `t${ADDED}/s1` });
    await sleep(300);

    const result = await playback({
      action: "play-session-clips",
      path: GROUP_SLOT,
    });

    expect(result.clip).toStrictEqual({
      path: GROUP_SLOT,
      detail: `launched t${CHILD}/s0 (id ${childClip}); stopped t${ADDED} (id ${addedId}), which has no clip in s0`,
    });

    await sleep(300);
    expect(await clipPlaying(`t${CHILD}/s0`)).toBe(true);
    await waitUntilStopped(`t${ADDED}/s1`);

    await playback({ action: "stop-all-session-clips" });
    await playback({ action: "stop" });
  });

  it("names the tracks inside that stopping its slot stopped", async () => {
    const addedId = await addMemberToGroup();
    const childId = await trackId(`t${CHILD}`);

    await createClipOnTrack(CHILD, 0, "C3");
    await createClipOnTrack(ADDED, 0, "D3");
    await sleep(100);
    await playback({
      action: "play-session-clips",
      path: `t${ADDED}/s0,t${CHILD}/s0`,
    });
    await sleep(300);

    const stopped = await playback({
      action: "stop-session-clips",
      path: GROUP_SLOT,
    });

    expect(stopped.clip).toStrictEqual({
      path: GROUP_SLOT,
      detail: `stopped the tracks in this group track: t${ADDED} (id ${addedId}), t${CHILD} (id ${childId})`,
    });

    await waitUntilStopped(`t${ADDED}/s0`);
    await waitUntilStopped(`t${CHILD}/s0`);

    // Nothing is playing now, so there is nothing to name.
    const again = await playback({
      action: "stop-session-clips",
      path: GROUP_SLOT,
    });

    expect(again.clip).toStrictEqual({ path: GROUP_SLOT });

    await playback({ action: "stop" });
  });
});
