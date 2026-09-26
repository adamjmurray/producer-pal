// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for `ppal-duplicate` copying a whole lane: every clip on the source
 * — a track's main lane, or a take lane of its own — is re-created on the
 * destination lane, at the position it already had. A take-lane source also
 * promotes onto a track's main lane. No new track, and nothing but the clips.
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
  parseToolResultWithWarnings,
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
  clips: Array<{
    id?: string;
    path?: string;
    ok?: false;
    detail?: string;
    /** A copy a later one in the same call landed on top of */
    deleted?: true;
  }>;
  detail: string;
  ok?: false;
}

interface ReadTrackClipsResult {
  takeLaneCount?: number;
  takeLanes?: Array<{ id: string; name: string; clips: Array<{ id: string }> }>;
  arrangementClips?: Array<{ id: string; path: string }>;
}

interface ReadLiveSetTracksResult {
  tracks: Array<{ path: string }>;
}

/**
 * Create one MIDI clip, with a length when the notes don't give it one. A clip
 * on a take lane comes with Live's "targeting take lane" warning.
 */
async function createClip(
  path: string,
  notes: string,
  length?: string,
): Promise<CreateClipResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: { path, notes, ...(length == null ? {} : { length }) },
  });

  return path.includes("/l")
    ? parseToolResultWithWarnings<CreateClipResult>(result).data
    : parseToolResult<CreateClipResult>(result);
}

/** Put two MIDI clips on the source track's main lane, at bars 1 and 5. */
async function createSourceClips(): Promise<void> {
  await createClip(`${SOURCE}[1|1]`, "C3 E3 G3 1|1");
  await createClip(`${SOURCE}[5|1]`, "D3 F3 A3 1|1");
  await sleep(100);
}

/** Read a track's lanes and every arrangement clip on it. */
async function readTrackClips(track: string): Promise<ReadTrackClipsResult> {
  return parseToolResult<ReadTrackClipsResult>(
    await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { path: track, include: ["arrangement-clips"] },
    }),
  );
}

/** The clips on a track's main lane, in order. */
function mainLaneClips(
  track: ReadTrackClipsResult,
  path: string,
): Array<{ id: string; path: string }> {
  return (track.arrangementClips ?? []).filter((clip) =>
    clip.path.startsWith(`${path}[`),
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

/** Copy a source onto the take lanes a toPath names. */
async function copyToLanes<T>(
  source: Record<string, string>,
  toPath: string,
): Promise<T> {
  return parseToolResult<T>(
    await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "track", ...source, toPath },
    }),
  );
}

/**
 * Check a copy landed both source clips on the destination's first lane, and
 * that the notes came across.
 */
async function expectBothClipsOnNewLane(
  result: LaneCopyResult,
  sourceNotes: string,
): Promise<void> {
  expect(result.path).toBe(`${DESTINATION}/l0`);
  expect(result.created).toBe(true);
  expect(result.clips.map((clip) => clip.path)).toStrictEqual([
    `${DESTINATION}/l0[1|1]`,
    `${DESTINATION}/l0[5|1]`,
  ]);

  await sleep(100);
  const lanes = await readTrackClips(DESTINATION);

  expect(lanes.takeLanes).toHaveLength(1);
  expect(lanes.takeLanes![0]!.clips).toHaveLength(2);
  // The copy is rebuilt from the source's notes, so they have to match.
  expect(await readNotes({ id: result.clips[0]!.id! })).toBe(sourceNotes);
}

/** Stack the source track's main lane onto its own first take lane. */
async function stackOnSourceLane(): Promise<LaneCopyResult> {
  await createSourceClips();

  const onSource = await copyToLanes<LaneCopyResult>(
    { path: SOURCE },
    `${SOURCE}/l0`,
  );

  await sleep(100);

  return onSource;
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
    const result = await copyToLanes<LaneCopyResult>(
      { path: SOURCE },
      `${DESTINATION}/l0`,
    );

    await expectBothClipsOnNewLane(
      result,
      await readNotes({ path: `${SOURCE}[1|1]` }),
    );
    // The entry says what a lane can't take, so nothing is dropped silently.
    expect(result.detail).toContain("clips only");

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

    const result = await copyToLanes<LaneCopyResult[]>(
      { path: SOURCE },
      `${DESTINATION}/l+,t${GROUP_TRACK}/l0`,
    );

    // l+ appends: the destination had no lanes, so the copy made l0.
    expect(result[0]!.path).toBe(`${DESTINATION}/l0`);
    expect(result[0]!.created).toBe(true);
    expect(result[1]).toStrictEqual({
      path: `t${GROUP_TRACK}/l0`,
      ok: false,
      detail: `only regular tracks have take lanes; "t${GROUP_TRACK}" is a group track`,
    });

    await sleep(100);

    expect((await readTrackClips(DESTINATION)).takeLanes).toHaveLength(1);
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
    const lanes = await readTrackClips(`t${AUDIO_TRACK}`);

    expect(lanes).not.toHaveProperty("takeLanes");
  });

  it("copies a lane onto another track's lane", async () => {
    const onSource = await stackOnSourceLane();

    // l+ appends: the destination had no lanes, so the copy makes l0.
    const result = await copyToLanes<LaneCopyResult>(
      { path: `${SOURCE}/l0` },
      `${DESTINATION}/l+`,
    );

    await expectBothClipsOnNewLane(
      result,
      await readNotes({ id: onSource.clips[0]!.id! }),
    );
  });

  it("copies the lane an id names", async () => {
    const onSource = await stackOnSourceLane();

    const result = await copyToLanes<LaneCopyResult>(
      { id: onSource.id },
      `${DESTINATION}/l+`,
    );

    await expectBothClipsOnNewLane(
      result,
      await readNotes({ id: onSource.clips[0]!.id! }),
    );
  });

  it("refuses a lane copied onto itself, and one with no destination", async () => {
    const onSource = await stackOnSourceLane();

    const ontoItself = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "track",
        id: onSource.id,
        toPath: `${SOURCE}/l0`,
      },
    });

    expect(isToolError(ontoItself)).toBe(true);
    expect(getToolErrorMessage(ontoItself)).toContain(
      "a lane can't copy onto itself",
    );

    // A lane can't stand in for the track a new-track copy needs, so a call
    // that named no destination is refused rather than making one.
    const nowhere = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "track", id: onSource.id },
    });

    expect(isToolError(nowhere)).toBe(true);
    expect(getToolErrorMessage(nowhere)).toContain("its clips need a toPath");

    await sleep(100);
    // Neither refusal made a lane, and the source still has just the one.
    expect((await readTrackClips(SOURCE)).takeLanes).toHaveLength(1);
    expect(await readTrackClips(DESTINATION)).not.toHaveProperty("takeLanes");
  });

  it("keeps the lane that fits when another destination is past the cap", async () => {
    await createSourceClips();

    const result = await copyToLanes<LaneCopyResult[]>(
      { path: SOURCE },
      `${DESTINATION}/l0,${DESTINATION}/l${MAX_TAKE_LANES}`,
    );

    expect(result[0]!.path).toBe(`${DESTINATION}/l0`);
    expect(result[1]).toStrictEqual({
      path: `${DESTINATION}/l${MAX_TAKE_LANES}`,
      ok: false,
      detail: `take lane "l${MAX_TAKE_LANES}" is out of range: Producer Pal creates take lanes only up to "l${MAX_TAKE_LANES - 1}"`,
    });

    await sleep(100);
    const lanes = await readTrackClips(DESTINATION);

    // Only the lane that fit was created — the cap is checked before any is.
    expect(lanes.takeLanes).toHaveLength(1);
  });
});

describe("ppal-duplicate take lane to a main lane", () => {
  it("promotes a lane onto its own track's main lane", async () => {
    const onSource = await stackOnSourceLane();

    const result = await copyToLanes<LaneCopyResult>(
      { id: onSource.id },
      SOURCE,
    );

    expect(result.path).toBe(SOURCE);
    // Nothing is created: the main lane is the track itself.
    expect(result).not.toHaveProperty("created");
    expect(result.clips.map((clip) => clip.path)).toStrictEqual([
      `${SOURCE}[1|1]`,
      `${SOURCE}[5|1]`,
    ]);
    expect(result.detail).toContain("clips only");

    await sleep(100);
    const track = await readTrackClips(SOURCE);

    // The promoted clips replaced the main-lane ones they landed on, and the
    // track still has the one lane it had.
    expect(mainLaneClips(track, SOURCE).map((clip) => clip.id)).toStrictEqual(
      result.clips.map((clip) => clip.id),
    );
    expect(track.takeLanes).toHaveLength(1);
  });

  it("promotes a lane onto another track's main lane", async () => {
    const onSource = await stackOnSourceLane();

    const result = await copyToLanes<LaneCopyResult>(
      { path: `${SOURCE}/l0` },
      DESTINATION,
    );

    expect(result.path).toBe(DESTINATION);
    expect(result.clips.map((clip) => clip.path)).toStrictEqual([
      `${DESTINATION}[1|1]`,
      `${DESTINATION}[5|1]`,
    ]);

    await sleep(100);
    const track = await readTrackClips(DESTINATION);

    expect(mainLaneClips(track, DESTINATION)).toHaveLength(2);
    // A promote makes no lane on the way.
    expect(track).not.toHaveProperty("takeLanes");
    // The copy is rebuilt from the source's notes, so they have to match.
    expect(await readNotes({ id: result.clips[0]!.id! })).toBe(
      await readNotes({ id: onSource.clips[0]!.id! }),
    );
  });

  it("leaves the remainder of a clip a promote lands across", async () => {
    // A four-bar clip on the destination's main lane, and a one-bar take on
    // its first lane, both starting at bar 1.
    await createClip(`${DESTINATION}[1|1]`, "C3 1|1", "4bar");
    await createClip(`${DESTINATION}/l0[1|1]`, "D3 1|1");
    await sleep(100);

    const result = await copyToLanes<LaneCopyResult>(
      { path: `${DESTINATION}/l0` },
      DESTINATION,
    );

    expect(result.clips.map((clip) => clip.path)).toStrictEqual([
      `${DESTINATION}[1|1]`,
    ]);

    await sleep(100);
    const clips = mainLaneClips(await readTrackClips(DESTINATION), DESTINATION);

    // The promote covers the long clip's first bar only, so the rest of it
    // stays, starting where the promoted clip ends.
    expect(clips).toHaveLength(2);
    expect(clips.map((clip) => clip.id)).toContain(result.clips[0]!.id);
    expect(clips.map((clip) => clip.path)).not.toStrictEqual([
      `${DESTINATION}[1|1]`,
      `${DESTINATION}[1|1]`,
    ]);
  });

  it("marks the copy a second destination in the same call landed on", async () => {
    await stackOnSourceLane();

    const result = await copyToLanes<LaneCopyResult[]>(
      { path: `${SOURCE}/l0` },
      `${DESTINATION},${DESTINATION}`,
    );

    // Both entries name the same main lane, so the second create cleared what
    // the first put there — and the first entry says so, id gone.
    expect(result[0]!.clips).toStrictEqual([
      {
        path: `${DESTINATION}[1|1]`,
        deleted: true,
        detail: "a later copy in this call landed on it",
      },
      {
        path: `${DESTINATION}[5|1]`,
        deleted: true,
        detail: "a later copy in this call landed on it",
      },
    ]);
    expect(result[1]!.clips.map((clip) => clip.path)).toStrictEqual([
      `${DESTINATION}[1|1]`,
      `${DESTINATION}[5|1]`,
    ]);

    await sleep(100);
    expect(
      mainLaneClips(await readTrackClips(DESTINATION), DESTINATION),
    ).toHaveLength(2);
  });

  it("refuses a promote onto a track of the other type", async () => {
    const onSource = await stackOnSourceLane();

    const refused = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "track",
        id: onSource.id,
        toPath: `t${AUDIO_TRACK}`,
      },
    });

    expect(isToolError(refused)).toBe(true);
    expect(getToolErrorMessage(refused)).toContain(
      "a MIDI clip needs a MIDI track",
    );

    await sleep(100);
    // The refusal landed nothing on the audio track's main lane.
    expect(
      mainLaneClips(await readTrackClips(`t${AUDIO_TRACK}`), `t${AUDIO_TRACK}`),
    ).toHaveLength(0);
  });
});
