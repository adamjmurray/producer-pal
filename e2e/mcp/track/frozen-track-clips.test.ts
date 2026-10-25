// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for clip writes aimed at a frozen track: create-clip, duplicate
 * and update-clip moves are refused with a reason that names the freeze, the
 * source stays put, and the other targets in the same call still land and are
 * reported. ppal-read-track flags the frozen tracks. Freezing has no Live API,
 * so the frozen tracks come from the Set.
 * Uses: tracks-test (t0 "Source MIDI" and t1 "Source Audio" hold a clip in s0
 * and at 1|1; t2 "Frozen MIDI" and t3 "Frozen Audio" are frozen, each with a
 * clip in s0 only)
 * See: e2e/live-sets/specs/tracks-test-spec.md
 *
 * Run with: npm run e2e:mcp -- track/frozen-track-clips
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  readIdAtPath,
  setupMcpTestContext,
} from "../mcp-test-helpers";
import { SAMPLE_FILE, TRACKS_TEST_PATH } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext({ liveSetPath: TRACKS_TEST_PATH });

const SOURCE_MIDI = 0;
const SOURCE_AUDIO = 1;
const FROZEN_MIDI = 2;
const FROZEN_AUDIO = 3;

interface Entry {
  id?: string;
  path?: string;
  ok?: false;
  detail?: string;
}

interface TrackClips {
  sessionClips?: Entry[];
  arrangementClips?: Entry[];
}

/** Why a write to each frozen track is refused, by track index. */
const frozenReason: Record<number, string> = {};

beforeEach(async () => {
  for (const index of [FROZEN_MIDI, FROZEN_AUDIO]) {
    const id = await readIdAtPath(ctx.client!, "ppal-read-track", `t${index}`);

    frozenReason[index] =
      `track t${index} (id ${id}) is frozen; unfreeze it first`;
  }
});

async function call(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return await ctx.client!.callTool({ name, arguments: args });
}

/**
 * Assert a call with one target was refused for that track's freeze.
 * @param result - The raw tool result
 * @param reason - The expected reason
 */
function expectRefused(result: unknown, reason: string): void {
  expect(isToolError(result)).toBe(true);
  expect(getToolErrorMessage(result)).toBe(`Error: ${reason}`);
}

async function readTrackClips(index: number): Promise<TrackClips> {
  return parseToolResult<TrackClips>(
    await call("ppal-read-track", {
      path: `t${index}`,
      include: ["session-clips", "arrangement-clips"],
    }),
  );
}

/** A frozen track's clips as the Set has them: one in s0, none arranged. */
async function expectFrozenUntouched(index: number): Promise<void> {
  const clips = await readTrackClips(index);

  expect(clips.sessionClips?.map((clip) => clip.path)).toStrictEqual([
    `t${index}/s0`,
  ]);
  expect(clips.arrangementClips).toStrictEqual([]);
}

const clipId = (path: string): Promise<string> =>
  readIdAtPath(ctx.client!, "ppal-read-clip", path);

describe("ppal-read-track on a frozen track", () => {
  it("flags only the frozen tracks", async () => {
    const tracks = [SOURCE_MIDI, SOURCE_AUDIO, FROZEN_MIDI, FROZEN_AUDIO];
    const flags = await Promise.all(
      tracks.map(
        async (index) =>
          parseToolResult<{ isFrozen?: true }>(
            await call("ppal-read-track", { path: `t${index}` }),
          ).isFrozen,
      ),
    );

    expect(flags).toStrictEqual([undefined, undefined, true, true]);
  });
});

describe("ppal-create-clip on a frozen track", () => {
  it("refuses a MIDI clip, naming the freeze rather than the track type", async () => {
    for (const path of [`t${FROZEN_MIDI}/s1`, `t${FROZEN_MIDI}[1|1]`]) {
      expectRefused(
        await call("ppal-create-clip", { path, notes: "C3 1|1" }),
        frozenReason[FROZEN_MIDI]!,
      );
    }

    await expectFrozenUntouched(FROZEN_MIDI);
  });

  it("refuses an audio clip, in the session and the arrangement", async () => {
    for (const path of [`t${FROZEN_AUDIO}/s1`, `t${FROZEN_AUDIO}[1|1]`]) {
      expectRefused(
        await call("ppal-create-clip", { path, sampleFile: SAMPLE_FILE }),
        frozenReason[FROZEN_AUDIO]!,
      );
    }

    await expectFrozenUntouched(FROZEN_AUDIO);
  });

  it("still creates and reports the clip beside the frozen one", async () => {
    const data = parseToolResult<Entry[]>(
      await call("ppal-create-clip", {
        path: `t${FROZEN_MIDI}/s1,t${SOURCE_MIDI}/s2`,
        notes: "C3 1|1",
      }),
    );

    expect(data[0]).toStrictEqual({
      path: `t${FROZEN_MIDI}/s1`,
      ok: false,
      detail: frozenReason[FROZEN_MIDI],
    });
    expect(data[1]).toStrictEqual({
      id: await clipId(`t${SOURCE_MIDI}/s2`),
      path: `t${SOURCE_MIDI}/s2`,
      noteCount: 1,
      length: "1bar",
    });
  });
});

describe("ppal-duplicate of a clip to a frozen track", () => {
  it("refuses a session or arrangement copy, leaving the source alone", async () => {
    const source = `t${SOURCE_MIDI}/s0`;
    const sourceId = await clipId(source);

    for (const toPath of [`t${FROZEN_MIDI}/s2`, `t${FROZEN_MIDI}[5|1]`]) {
      expectRefused(
        await call("ppal-duplicate", { type: "clip", path: source, toPath }),
        frozenReason[FROZEN_MIDI]!,
      );
    }

    expect(await clipId(source)).toBe(sourceId);
    await expectFrozenUntouched(FROZEN_MIDI);
  });

  it("lands and reports the copies beside a frozen destination", async () => {
    const session = parseToolResult<Entry[]>(
      await call("ppal-duplicate", {
        type: "clip",
        path: `t${SOURCE_AUDIO}/s0`,
        toPath: `t${FROZEN_AUDIO}/s2,t${SOURCE_AUDIO}/s2`,
      }),
    );

    expect(session).toStrictEqual([
      {
        path: `t${FROZEN_AUDIO}/s2`,
        ok: false,
        detail: frozenReason[FROZEN_AUDIO],
      },
      {
        id: await clipId(`t${SOURCE_AUDIO}/s2`),
        path: `t${SOURCE_AUDIO}/s2`,
      },
    ]);

    // By id too: the reason is the same however the source was named.
    const arranged = parseToolResult<Entry[]>(
      await call("ppal-duplicate", {
        type: "clip",
        id: await clipId(`t${SOURCE_MIDI}[1|1]`),
        toPath: `t${FROZEN_MIDI}[9|1],t${SOURCE_MIDI}[9|1]`,
      }),
    );

    expect(arranged).toStrictEqual([
      {
        path: `t${FROZEN_MIDI}[9|1]`,
        ok: false,
        detail: frozenReason[FROZEN_MIDI],
      },
      {
        id: await clipId(`t${SOURCE_MIDI}[9|1]`),
        path: `t${SOURCE_MIDI}[9|1]`,
      },
    ]);

    await expectFrozenUntouched(FROZEN_MIDI);
    await expectFrozenUntouched(FROZEN_AUDIO);
  });
});

describe("ppal-update-clip moving a clip to a frozen track", () => {
  it("refuses a move to a slot or the arrangement, and the clip stays put", async () => {
    const moves = [
      [`t${SOURCE_MIDI}/s0`, `t${FROZEN_MIDI}/s1`, FROZEN_MIDI],
      [`t${SOURCE_MIDI}[1|1]`, `t${FROZEN_MIDI}[3|1]`, FROZEN_MIDI],
      [`t${SOURCE_AUDIO}/s0`, `t${FROZEN_AUDIO}/s1`, FROZEN_AUDIO],
      [`t${SOURCE_AUDIO}[1|1]`, `t${FROZEN_AUDIO}[3|1]`, FROZEN_AUDIO],
    ] as const;

    for (const [path, toPath, frozen] of moves) {
      const id = await clipId(path);

      expectRefused(
        await call("ppal-update-clip", { path, toPath }),
        `not moved: ${frozenReason[frozen]}`,
      );
      expect(await clipId(path)).toBe(id);
    }

    await expectFrozenUntouched(FROZEN_MIDI);
    await expectFrozenUntouched(FROZEN_AUDIO);
  });

  it("moves the other clip named by id, and says why the frozen one didn't", async () => {
    const stays = await clipId(`t${SOURCE_MIDI}/s0`);
    const created = parseToolResult<Entry>(
      await call("ppal-create-clip", {
        path: `t${SOURCE_MIDI}/s2`,
        notes: "C3 1|1",
      }),
    );

    const data = parseToolResult<Entry[]>(
      await call("ppal-update-clip", {
        id: `${stays},${created.id}`,
        toPath: `t${FROZEN_MIDI}/s1,t${SOURCE_MIDI}/s3`,
      }),
    );

    expect(data).toStrictEqual([
      {
        id: stays,
        ok: false,
        detail: `not moved: ${frozenReason[FROZEN_MIDI]}`,
      },
      // A session move re-creates the clip, so it has a new id.
      { id: await clipId(`t${SOURCE_MIDI}/s3`), path: `t${SOURCE_MIDI}/s3` },
    ]);
    expect(await clipId(`t${SOURCE_MIDI}/s0`)).toBe(stays);
    await expectFrozenUntouched(FROZEN_MIDI);
  });
});
