// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for an arrangement clip placed strictly inside another. Live 12.3
 * crashes on it; 12.4 splits the clip in the way. On 12.3 the main-lane cases
 * cut that clip first, so they must read the same on every Live — the same
 * assertions run on 12.3, 12.4 and 13. A take lane can't be cut, so there
 * 12.3 refuses.
 *
 * A failure here can be a Live crash, not a red assertion: run this file alone.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track, t4 = audio track with a looping
 * kick clip at 17|1, about 4 bars long)
 *
 * Run with: npm run e2e:mcp -- ppal-clip-inside-another
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  getToolErrorMessage,
  isToolError,
  KICK_FILE,
  parseToolResultWithWarnings,
  type ReadClipResult,
  SAMPLE_FILE,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import {
  createArrangementClip,
  moveOffTakeLane,
  readClipFully,
} from "../helpers/clip-io-test-helpers.ts";
import {
  clipsInBarRange,
  readArrangementClips,
} from "../helpers/arrangement-clip-query-test-helpers.ts";
import { liveVersionAtLeast } from "../../workflow/helpers/server-capability-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

// Take lanes are append-only, so each test needs a fresh Set (no `once`).
const ctx = setupMcpTestContext();

const T = EMPTY_MIDI_TRACK;
const KICK_TRACK = 4;

/** A main-lane MIDI clip of this suite, as read back. */
const MIDI_CLIP = {
  type: "midi",
  color: "#7B7B7B",
  timeSignature: "4/4",
  looping: true,
} as const;

const HOST_NOTES = "v100 n/4 C3 1|1\nD3 2|1\nE3 3|1\nF3 4|1";

/**
 * The 4-bar host after a 1-bar G3 clip lands at bar 2, as 12.4 leaves it: both
 * sides keep the host's loop, and the tail plays on from bar 3 of it.
 */
const SPLIT_HOST = [
  {
    ...MIDI_CLIP,
    path: `t${T}[1|1]`,
    arrangementLength: "1bar",
    start: "1|1",
    end: "5|1",
    length: "4bar",
    notes: HOST_NOTES,
  },
  {
    ...MIDI_CLIP,
    path: `t${T}[2|1]`,
    arrangementLength: "1bar",
    start: "1|1",
    end: "2|1",
    length: "1bar",
    notes: "v100 n/4 G3 1|1",
  },
  {
    ...MIDI_CLIP,
    path: `t${T}[3|1]`,
    arrangementLength: "2bar",
    start: "1|1",
    firstStart: "3|1",
    end: "5|1",
    length: "4bar",
    notes: HOST_NOTES,
  },
];

/** A kick clip on t4, as read back. */
const KICK_CLIP = {
  type: "audio",
  name: "kick",
  color: "#87FF67",
  timeSignature: "4/4",
  looping: true,
  start: "1|1-n0.0705/4",
  end: "1|2+n0.8933/4",
  length: "n1.9638/4",
  sampleFile: KICK_FILE,
  sampleLength: 1694,
  sampleRate: 22050,
  warpMode: "beats",
  warping: true,
} as const;

/** Where the kick picks up again after sample.aiff at 18|1. */
const KICK_TAIL = `t${KICK_TRACK}[18|2+n0.9638/4]`;

/** t4's kick at 17|1 after sample.aiff lands at 18|1, as 12.4 leaves it. */
const SPLIT_KICK = [
  {
    ...KICK_CLIP,
    path: `t${KICK_TRACK}[17|1]`,
    arrangementLength: "1bar",
    firstStart: "1|1",
  },
  {
    type: "audio",
    name: "sample",
    color: "#87FF67",
    timeSignature: "4/4",
    looping: false,
    path: `t${KICK_TRACK}[18|1]`,
    arrangementLength: "n1.9638/4",
    start: "1|1",
    end: "1|2+n0.9638/4",
    length: "n1.9638/4",
    sampleFile: SAMPLE_FILE,
    sampleLength: 24056,
    sampleRate: 22050,
    warping: false,
  },
  {
    ...KICK_CLIP,
    path: KICK_TAIL,
    arrangementLength: "n9.9295/4",
    firstStart: "1|1+n0.0725/4",
  },
];

describe("a clip placed strictly inside another", () => {
  it("create-clip: MIDI splits the clip in the way", async () => {
    await createHost();

    const entry = await createClip({
      path: `t${T}[2|1]`,
      notes: "G3 1|1",
      length: "1bar",
    });

    expect(entry).toStrictEqual({
      id: entry.id,
      path: `t${T}[2|1]`,
      noteCount: 1,
      detail: `split the clip at t${T}[1|1] into t${T}[1|1] and t${T}[3|1]`,
    });
    expect(await mainLane(T, 1, 4)).toStrictEqual(SPLIT_HOST);
    expect((await readClipFully(ctx.client!, { path: `t${T}[2|1]` })).id).toBe(
      entry.id,
    );
  });

  it("create-clip: audio splits the clip in the way", async () => {
    const entry = await createClip({
      path: `t${KICK_TRACK}[18|1]`,
      sampleFile: SAMPLE_FILE,
    });

    expect(entry).toStrictEqual({
      id: entry.id,
      path: `t${KICK_TRACK}[18|1]`,
      length: "n1.9638/4",
      warping: false,
      detail: `split the clip at t${KICK_TRACK}[17|1] into t${KICK_TRACK}[17|1] and ${KICK_TAIL}`,
    });
    const lane = await mainLane(KICK_TRACK, 17, 22);

    // A new clip takes Live's Default Warp Mode preference, set per install.
    delete lane[1]?.warpMode;

    expect(lane).toStrictEqual(SPLIT_KICK);
  });

  it("update-clip: a take-lane clip moved inside splits the clip in the way", async () => {
    await createHost();
    const source = await takeLaneSource();

    const moved = await moveOffTakeLane(ctx.client!, source, `t${T}[2|1]`);

    expect(moved.path).toBe(`t${T}[2|1]`);
    expect(await mainLane(T, 1, 4)).toStrictEqual(SPLIT_HOST);
  });

  it("duplicate: a take-lane clip copied inside splits the clip in the way", async () => {
    await createHost();
    const source = await takeLaneSource();

    const result = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "clip", id: source.id, toPath: `t${T}[2|1]` },
    });
    const copy = parseToolResultWithWarnings<ReadClipResult>(result).data;

    await sleep(100);

    expect(copy.path).toBe(`t${T}[2|1]`);
    expect(await mainLane(T, 1, 4)).toStrictEqual(SPLIT_HOST);
  });

  it("create-clip inside a take-lane clip is refused on Live 12.3", async ({
    skip,
  }) => {
    skip(
      await liveVersionAtLeast(ctx.client!, "12.4"),
      "only Live 12.3 refuses; 12.4 splits the clip",
    );

    const host = await createArrangementClip(ctx.client!, T, "1|1", {
      name: "Host",
      length: "4bar",
      laneSuffix: "/l0",
    });
    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { path: `t${T}/l0[2|1]`, notes: "G3 1|1", length: "1bar" },
    });

    await sleep(100);

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      `Live 12.3 crashes placing a clip inside another on a take lane (t${T}/l0[1|1]); start it at or outside that clip's edges, or use Live 12.4`,
    );

    const lane = await readClipFully(ctx.client!, { path: `t${T}/l0[1|1]` });

    expect(lane.id).toBe(host.id);
    expect(lane.arrangementLength).toBe("4bar");
  });
});

// --- Helpers ---

/**
 * A 4-bar clip at bar 1 of t8's main lane, one note per bar.
 */
async function createHost(): Promise<void> {
  await createClip({
    path: `t${T}[1|1]`,
    notes: "C3 1|1 D3 2|1 E3 3|1 F3 4|1",
    length: "4bar",
  });
}

/**
 * A 1-bar clip holding G3 on t8's first take lane, at bar 9.
 * @returns The clip
 */
async function takeLaneSource(): Promise<CreateClipResult> {
  return createClip({
    path: `t${T}/l0[9|1]`,
    notes: "G3 1|1",
    length: "1bar",
  });
}

/**
 * Create a clip, tolerating the hint a take lane always warns with.
 * @param args - The ppal-create-clip arguments
 * @returns The entry
 */
async function createClip(
  args: Record<string, unknown>,
): Promise<CreateClipResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: args,
  });

  await sleep(100);

  return parseToolResultWithWarnings<CreateClipResult>(result).data;
}

/**
 * The clips on a track's main lane starting in a bar range, read back in full.
 * @param trackIndex - The track
 * @param minBar - First bar, inclusive
 * @param maxBar - Last bar, inclusive
 * @returns Each clip as ppal-read-clip reports it, minus its Live-assigned id
 */
async function mainLane(
  trackIndex: number,
  minBar: number,
  maxBar: number,
): Promise<Omit<ReadClipResult, "id">[]> {
  const clips = clipsInBarRange(
    await readArrangementClips(ctx.client!, trackIndex),
    minBar,
    maxBar,
  );

  return Promise.all(
    clips.map(async ({ id }) => {
      const { id: _id, ...clip } = await readClipFully(ctx.client!, { id });

      return clip;
    }),
  );
}
