// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for `ppal-duplicate` with a track source and a take-lane
 * destination: every clip on the source's main lane is re-created on the lane,
 * at the position it already had. No new track, and nothing but the clips.
 *
 * Take lanes are append-only, so every test depends on setupMcpTestContext()
 * reopening the Set between tests (no `once`).
 *
 * Uses: e2e-test-set. t8 "9-MIDI" is an empty MIDI track, t10 "Child" an empty
 * MIDI track in a group, t5 "Audio 2" an audio track, t9 "Parent" the group.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- operations/ppal-duplicate-track-to-lane
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";
import { MAX_TAKE_LANES } from "#src/tools/constants.ts";
import { AUDIO_TRACK, CHILD_TRACK, EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext();

/** The source track's clips live here; the copies go to another track's lane. */
const SOURCE = `t${EMPTY_MIDI_TRACK}`;
const DESTINATION = `t${CHILD_TRACK}`;

/** t9 "Parent", the group track that can hold no lanes. */
const GROUP_TRACK = 9;

/** One lane entry of a track-to-lane duplicate. */
interface LaneCopyResult {
  id: string;
  path: string;
  created?: true;
  clips: Array<{ id?: string; path?: string; ok?: false; reason?: string }>;
  reason: string;
  ok?: false;
}

interface ReadTrackLanesResult {
  takeLaneCount?: number;
  takeLanes?: Array<{ id: string; name: string; clips: Array<{ id: string }> }>;
}

interface ReadLiveSetTracksResult {
  tracks: Array<{ path: string }>;
}

/** Put two MIDI clips on the source track's main lane, at bars 1 and 5. */
async function createSourceClips(): Promise<void> {
  for (const [bar, notes] of [
    [1, "C3 E3 G3 1|1"],
    [5, "D3 F3 A3 1|1"],
  ] as const) {
    parseToolResult<CreateClipResult>(
      await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: { path: `${SOURCE}[${bar}|1]`, notes },
      }),
    );
  }

  await sleep(100);
}

/** Read a track's lanes and the clips on them. */
async function readLanes(track: string): Promise<ReadTrackLanesResult> {
  return parseToolResult<ReadTrackLanesResult>(
    await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { path: track, include: ["arrangement-clips"] },
    }),
  );
}

/** The notes of one clip, by path or id. */
async function readNotes(target: Record<string, string>): Promise<string> {
  const clip = parseToolResult<ReadClipResult>(
    await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { ...target, include: ["notes"] },
    }),
  );

  return clip.notes ?? "";
}

describe("ppal-duplicate track to a take lane", () => {
  it("copies a track's arrangement clips onto a new lane, and makes no track", async () => {
    await createSourceClips();

    const before = parseToolResult<ReadLiveSetTracksResult>(
      await ctx.client!.callTool({
        name: "ppal-read-live-set",
        arguments: { include: ["tracks"] },
      }),
    );
    const result = parseToolResult<LaneCopyResult>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "track",
          path: SOURCE,
          toPath: `${DESTINATION}/l0`,
        },
      }),
    );

    expect(result.path).toBe(`${DESTINATION}/l0`);
    expect(result.created).toBe(true);
    expect(result.clips.map((clip) => clip.path)).toStrictEqual([
      `${DESTINATION}/l0[1|1]`,
      `${DESTINATION}/l0[5|1]`,
    ]);
    // The entry says what a lane can't take, so nothing is dropped silently.
    expect(result.reason).toContain("clips only");

    await sleep(100);
    const lanes = await readLanes(DESTINATION);

    expect(lanes.takeLanes).toHaveLength(1);
    expect(lanes.takeLanes![0]!.clips).toHaveLength(2);

    // The copy is rebuilt from the source's notes, so they have to match.
    expect(await readNotes({ id: result.clips[0]!.id! })).toBe(
      await readNotes({ path: `${SOURCE}[1|1]` }),
    );

    // A lane copy is not a track copy: the Set has the same tracks it had.
    const after = parseToolResult<ReadLiveSetTracksResult>(
      await ctx.client!.callTool({
        name: "ppal-read-live-set",
        arguments: { include: ["tracks"] },
      }),
    );

    expect(after.tracks.length).toBe(before.tracks.length);
  });

  it("appends a lane with l+, and refuses a group track beside it", async () => {
    await createSourceClips();

    const result = parseToolResult<LaneCopyResult[]>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "track",
          path: SOURCE,
          toPath: `${DESTINATION}/l+,t${GROUP_TRACK}/l0`,
        },
      }),
    );

    // l+ appends: the destination had no lanes, so the copy made l0.
    expect(result[0]!.path).toBe(`${DESTINATION}/l0`);
    expect(result[0]!.created).toBe(true);
    expect(result[1]).toStrictEqual({
      path: `t${GROUP_TRACK}/l0`,
      ok: false,
      reason: `only regular tracks have take lanes; "t${GROUP_TRACK}" is a group track`,
    });

    await sleep(100);

    expect((await readLanes(DESTINATION)).takeLanes).toHaveLength(1);
  });

  it("refuses a destination of the other type, and makes no lane", async () => {
    await createSourceClips();

    const refused = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "track",
        path: SOURCE,
        toPath: `t${AUDIO_TRACK}/l0`,
      },
    });

    expect(isToolError(refused)).toBe(true);
    expect(getToolErrorMessage(refused)).toContain(
      "a MIDI clip needs a MIDI track",
    );

    await sleep(100);
    const lanes = await readLanes(`t${AUDIO_TRACK}`);

    expect(lanes).not.toHaveProperty("takeLanes");
  });

  it("keeps the lane that fits when another destination is past the cap", async () => {
    await createSourceClips();

    const result = parseToolResult<LaneCopyResult[]>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "track",
          path: SOURCE,
          toPath: `${DESTINATION}/l0,${DESTINATION}/l${MAX_TAKE_LANES}`,
        },
      }),
    );

    expect(result[0]!.path).toBe(`${DESTINATION}/l0`);
    expect(result[1]).toStrictEqual({
      path: `${DESTINATION}/l${MAX_TAKE_LANES}`,
      ok: false,
      reason: `take lane "l${MAX_TAKE_LANES}" is out of range: a track has "l0" through "l${MAX_TAKE_LANES - 1}"`,
    });

    await sleep(100);
    const lanes = await readLanes(DESTINATION);

    // Only the lane that fit was created — the cap is checked before any is.
    expect(lanes.takeLanes).toHaveLength(1);
  });
});
