// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests that clip envelopes survive both arrangementLength routes.
 *
 * docs/features/limitations.md makes two envelope claims: tiling is the default
 * *because* each tile is a real copy, so envelopes come along; and the
 * single-clip route (`looping: false` + notes) keeps them because the clip keeps
 * its ID. A regression in either would silently destroy a user's envelopes, and
 * nothing else would catch it.
 *
 * The Live API can't create an envelope, so the fixture has to be saved into the
 * Set: every MIDI clip in arrangement-clip-tests carries a pitch-bend clip
 * envelope. t0's is the one used here.
 *
 * `has_envelopes` is only readable through ppal-live-api, which this suite turns
 * on at runtime — no debug build needed.
 *
 * Uses: arrangement-clip-tests (t0 = 1-bar looped MIDI with an envelope)
 * See: e2e/live-sets/arrangement-clip-tests-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-arrangement-envelopes
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  parseToolResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import {
  callTool,
  clipsInBarRange,
  duplicateClipToArrangement,
  readArrangementClips,
} from "../helpers/arrangement-clip-query-test-helpers.ts";
import { ARRANGEMENT_CLIP_TESTS_PATH } from "../helpers/arrangement-lengthening-test-helpers.ts";

const ctx = setupMcpTestContext({
  once: true,
  liveSetPath: ARRANGEMENT_CLIP_TESTS_PATH,
});

const ENVELOPE_TRACK = 0; // 1-bar looped MIDI clip carrying the envelope
const NO_ENVELOPE_TRACK = 15; // audio clip, no envelope — the negative control

/** Four bars of notes, so the single-clip route has a pattern to fill with. */
const FOUR_BARS_OF_NOTES = "C3 1|1 D3 2|1 E3 3|1 F3 4|1";

describe("arrangementLength preserves clip envelopes", () => {
  // setupMcpTestContext's beforeEach resets config.tools to the standard set,
  // which excludes ppal-live-api. Re-enable it for each test.
  beforeEach(async () => {
    await setConfig({ liveApiEnabled: true });
  });

  it("reads the fixture's envelope, and no envelope where there is none", async () => {
    // The negative control matters: without it, a has_envelopes regression that
    // returned true unconditionally would make every test below pass.
    expect(await hasEnvelopes(await fixtureClipId())).toBe(true);
    expect(await hasEnvelopes(await audioClipId())).toBe(false);
  });

  it("keeps the envelope on every tile when lengthening a looping clip", async () => {
    const { id } = await duplicateClipToArrangement(
      ctx.client!,
      await fixtureClipId(),
      "101|1",
    );

    await callTool(ctx.client!, "ppal-update-clip", {
      ids: id,
      arrangementLength: "4bar",
    });
    await sleep(200);

    const tiles = clipsInBarRange(await readEnvelopeTrackClips(), 101, 104);

    expect(tiles).toHaveLength(4);

    const flags = await Promise.all(
      tiles.map((tile) => hasEnvelopes(tile.id!)),
    );

    // Every tile, not just the first — a partial copy would still tile.
    expect(flags).toStrictEqual([true, true, true, true]);
  });

  it("keeps the envelope on the single clip from the looping:false route", async () => {
    const { id } = await duplicateClipToArrangement(
      ctx.client!,
      await fixtureClipId(),
      "111|1",
    );

    const result = await callTool(ctx.client!, "ppal-update-clip", {
      ids: id,
      arrangementLength: "4bar",
      looping: false,
      notes: FOUR_BARS_OF_NOTES,
    });

    await sleep(200);

    // The clip keeps its ID, which is why the envelope survives at all.
    expect(parseToolResult<{ id: string }>(result).id).toBe(id);

    const clips = clipsInBarRange(await readEnvelopeTrackClips(), 111, 114);

    expect(clips).toHaveLength(1);
    expect(clips[0]!.id).toBe(id);
    expect(await hasEnvelopes(id)).toBe(true);
  });
});

/** Read every arrangement clip on the envelope fixture's track. */
function readEnvelopeTrackClips() {
  return readArrangementClips(ctx.client!, ENVELOPE_TRACK);
}

/**
 * The Set's fixture clip: the 1-bar looped MIDI clip at bar 1 on t0.
 * @returns The fixture clip's ID
 */
async function fixtureClipId(): Promise<string> {
  const clips = clipsInBarRange(await readEnvelopeTrackClips(), 1, 1);

  expect(clips).toHaveLength(1);

  return clips[0]!.id!;
}

/**
 * The negative control: the audio clip at bar 1 on t15, which has no envelope.
 * @returns The audio clip's ID
 */
async function audioClipId(): Promise<string> {
  const clips = clipsInBarRange(
    await readArrangementClips(ctx.client!, NO_ENVELOPE_TRACK),
    1,
    1,
  );

  expect(clips).toHaveLength(1);

  return clips[0]!.id!;
}

interface LiveApiResult {
  results: Array<{ result: unknown }>;
}

/**
 * Read a clip's has_envelopes flag, the only envelope signal the Live API
 * exposes — there is no way to read an envelope's data.
 * @param clipId - The clip's Live API ID
 * @returns Whether the clip carries at least one envelope
 */
async function hasEnvelopes(clipId: string): Promise<boolean> {
  const result = await callTool(ctx.client!, "ppal-live-api", {
    path: `id ${clipId}`,
    operations: [{ type: "get", property: "has_envelopes" }],
  });

  const [value] = parseToolResult<LiveApiResult>(result).results[0]!
    .result as number[];

  return value === 1;
}
