// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for group tracks inside group tracks: what delete, duplicate and
 * playback say about every track inside, and that folding a group doesn't
 * move the tracks in it. Grouping has no Live API, so the nesting comes from
 * the Set.
 * Uses: tracks-test (t4 "Outer" holds t5 and the t6 "Inner" group, which
 * holds t7 and t8; t9 "Shell" holds only the t10 "Core" group, which holds
 * only t11)
 * See: e2e/live-sets/specs/tracks-test-spec.md
 *
 * Run with: npm run e2e:mcp -- track/nested-group-tracks
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  readIdAtPath,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";
import { TRACKS_TEST_PATH } from "../e2e-test-set.ts";
import { playbackCalls } from "../control/helpers/playback-test-helpers.ts";

const ctx = setupMcpTestContext({ liveSetPath: TRACKS_TEST_PATH });
const { playback, clipPlaying } = playbackCalls(ctx);

const OUTER = 4;
const OUTER_TRACK = 5;
const INNER = 6;
const INNER_TRACK_1 = 7;
const INNER_TRACK_2 = 8;
const SHELL = 9;
const CORE = 10;
const CORE_TRACK = 11;

/** Everything inside Outer, at every depth, in track order. */
const INSIDE_OUTER = [OUTER_TRACK, INNER, INNER_TRACK_1, INNER_TRACK_2];
/** The tracks inside Outer that hold clips, so firing its slot reaches them. */
const PLAYABLE_IN_OUTER = [OUTER_TRACK, INNER_TRACK_1, INNER_TRACK_2];

const WONT_DELETE = "Live won't delete the only track in a group track";

interface Track {
  id: string;
  path: string;
  name: string;
  groupId?: string;
}

interface Entry {
  id?: string;
  path?: string;
  ok?: false;
  detail?: string;
}

async function readTracks(): Promise<Track[]> {
  return parseToolResult<{ tracks: Track[] }>(
    await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["tracks"] },
    }),
  ).tracks;
}

/**
 * The label a result uses for a track: `t5 (id 7)`.
 * @param tracks - The Set's tracks, read when the label applies
 * @param index - The track's index
 * @returns The label
 */
function label(tracks: Track[], index: number): string {
  return `t${index} (id ${tracks[index]!.id})`;
}

/**
 * The indexes of every track inside a group, nested groups included.
 * @param tracks - The Set's tracks
 * @param groupIndex - The group's index
 * @returns The indexes, in track order
 */
function insideIndexes(tracks: Track[], groupIndex: number): number[] {
  const insideIds = new Set([tracks[groupIndex]!.id]);
  const inside: number[] = [];

  for (let index = groupIndex + 1; index < tracks.length; index++) {
    const track = tracks[index]!;

    if (track.groupId == null || !insideIds.has(track.groupId)) {
      break;
    }

    insideIds.add(track.id);
    inside.push(index);
  }

  return inside;
}

async function del(args: Record<string, unknown>): Promise<unknown> {
  return await ctx.client!.callTool({
    name: "ppal-delete",
    arguments: { type: "track", ...args },
  });
}

/**
 * The entry for a track delete skipped because the track is alone in its
 * group, all the way up to Shell.
 * @param tracks - The Set's tracks, read before the call
 * @param index - The skipped track's index
 * @returns The entry
 */
function skippedForShell(tracks: Track[], index: number): Entry {
  return {
    id: tracks[index]!.id,
    ok: false,
    detail: `${WONT_DELETE}; delete group track ${label(tracks, SHELL)} instead, which deletes the tracks inside it too`,
  };
}

describe("ppal-delete on nested group tracks", () => {
  it("lists every track deleting the outer group took, the inner group's too", async () => {
    const before = await readTracks();
    const result = parseToolResult<Entry>(await del({ path: `t${OUTER}` }));

    expect(result.ok).toBeUndefined();
    expect(result.detail).toBe(
      `also deleted the 4 tracks inside this group track: ${INSIDE_OUTER.map((index) => label(before, index)).join(", ")}`,
    );

    const goneIds = [OUTER, ...INSIDE_OUTER].map((index) => before[index]!.id);
    const after = await readTracks();

    expect(after).toHaveLength(before.length - 5);
    expect(after.filter((track) => goneIds.includes(track.id))).toStrictEqual(
      [],
    );
  });

  it("skips a group that is its parent's only member, naming the group above to delete", async () => {
    const before = await readTracks();
    const data = parseToolResult<Entry[]>(
      await del({ id: `${before[CORE]!.id},${before[OUTER_TRACK]!.id}` }),
    );

    expect(data[0]).toStrictEqual(skippedForShell(before, CORE));
    expect(data[1]?.ok).toBeUndefined();

    const after = await readTracks();

    expect(after.map((track) => track.id)).toContain(before[CORE]!.id);
    expect(after.map((track) => track.id)).not.toContain(
      before[OUTER_TRACK]!.id,
    );
  });

  it("walks up past a group that can't be deleted either", async () => {
    const before = await readTracks();
    // Core Track is Core's only member, and Core is Shell's.
    const data = parseToolResult<Entry[]>(
      await del({
        id: `${before[CORE_TRACK]!.id},${before[INNER_TRACK_1]!.id}`,
      }),
    );

    expect(data[0]).toStrictEqual(skippedForShell(before, CORE_TRACK));
    expect(data[1]?.ok).toBeUndefined();
    expect((await readTracks()).map((track) => track.id)).toContain(
      before[CORE_TRACK]!.id,
    );
  });
});

describe("ppal-duplicate on a nested group track", () => {
  it("lists every track copied at every depth, where it is after the call", async () => {
    const before = await readTracks();
    const copy = parseToolResult<Entry>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: { type: "track", id: before[OUTER]!.id },
      }),
    );

    await sleep(100);

    const after = await readTracks();
    const at = after.findIndex((track) => track.id === copy.id);
    const inside = insideIndexes(after, at);

    expect(at).toBeGreaterThan(-1);
    expect(inside.map((index) => after[index]!.name)).toStrictEqual(
      INSIDE_OUTER.map((index) => before[index]!.name),
    );
    expect(copy.detail).toBe(
      `also copied the 4 tracks inside this group track: ${inside.map((index) => label(after, index)).join(", ")}`,
    );

    // The inner group's copy holds the copies of its own tracks.
    const innerCopy = after[inside[1]!]!;

    expect(innerCopy.groupId).toBe(copy.id);
    expect(after[inside[2]!]!.groupId).toBe(innerCopy.id);
    expect(after[inside[3]!]!.groupId).toBe(innerCopy.id);
  });
});

describe("ppal-playback on a nested group track's slot", () => {
  /**
   * Wait for a clip to start or stop, which Live does at its launch
   * quantization.
   * @param path - The clip slot's path
   * @param playing - The state to wait for
   */
  async function waitUntil(path: string, playing: boolean): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await clipPlaying(path)) === playing) {
        return;
      }

      await sleep(250);
    }

    throw new Error(`${path} never ${playing ? "started" : "stopped"}`);
  }

  it("names the clips firing it launched inside the inner group, and the tracks stopping it stopped", async () => {
    const tracks = await readTracks();
    const clipLabels = await Promise.all(
      PLAYABLE_IN_OUTER.map(async (index) => {
        const slot = `t${index}/s0`;
        const id = await readIdAtPath(ctx.client!, "ppal-read-clip", slot);

        return `${slot} (id ${id})`;
      }),
    );

    const fired = await playback({
      action: "play-session-clips",
      path: `t${OUTER}/s0`,
    });

    expect(fired.clip).toStrictEqual({
      path: `t${OUTER}/s0`,
      detail: `launched ${clipLabels.join(", ")}`,
    });

    for (const index of PLAYABLE_IN_OUTER) {
      await waitUntil(`t${index}/s0`, true);
    }

    const stopped = await playback({
      action: "stop-session-clips",
      path: `t${OUTER}/s0`,
    });

    // The inner group isn't named: it holds no clips of its own.
    expect(stopped.clip).toStrictEqual({
      path: `t${OUTER}/s0`,
      detail: `stopped the tracks in this group track: ${PLAYABLE_IN_OUTER.map((index) => label(tracks, index)).join(", ")}`,
    });

    for (const index of PLAYABLE_IN_OUTER) {
      await waitUntil(`t${index}/s0`, false);
    }

    await playback({ action: "stop" });
  });
});

describe("addressing inside a folded group track", () => {
  it("keeps the indexes and slot paths of the tracks inside", async () => {
    await setConfig({ liveApiEnabled: true });

    const before = await readTracks();
    const clipId = await readIdAtPath(
      ctx.client!,
      "ppal-read-clip",
      `t${INNER_TRACK_1}/s0`,
    );

    const folded = parseToolResult<{ results: unknown[] }>(
      await ctx.client!.callTool({
        name: "ppal-live-api",
        arguments: {
          path: `live_set tracks ${OUTER}`,
          operations: [
            { type: "set-property", property: "fold_state", value: 1 },
            { type: "get-property", property: "fold_state" },
          ],
        },
      }),
    );

    expect(folded.results[1]).toBe(1);

    const where = (tracks: Track[]): Array<Partial<Track>> =>
      tracks.map(({ id, path, groupId }) => ({ id, path, groupId }));

    expect(where(await readTracks())).toStrictEqual(where(before));
    expect(
      await readIdAtPath(ctx.client!, "ppal-read-clip", `t${INNER_TRACK_1}/s0`),
    ).toBe(clipId);
  });
});
