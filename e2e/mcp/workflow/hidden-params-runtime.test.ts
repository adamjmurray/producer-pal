// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Every hidden param, called for real.
 *
 * deprecated-params.test.ts pins what the catalogs publish. This pins the other
 * half: a caller still sending a retired or guessed name gets the canonical
 * behavior and a warning naming the replacement. A regression here breaks old
 * clients silently, so the last test fails if a new hidden param is added
 * without a case in helpers/hidden-params-runtime-test-cases.ts.
 *
 * Uses: e2e-test-set (t7 and t8 are empty MIDI tracks)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- workflow/hidden-params-runtime
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  parseToolResultWithWarnings,
  setupMcpTestContext,
} from "../mcp-test-helpers";
import { EMPTY_MIDI_TRACK, RACKS_TRACK } from "../e2e-test-set.ts";
import {
  type AnyResult,
  CASES,
  type CallTool,
  state,
} from "./helpers/hidden-params-runtime-test-cases.ts";
import {
  expectedWarnings,
  hiddenByTool,
} from "./helpers/hidden-params-runtime-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

interface TrackRouting {
  id: string;
  inputRoutingType: { inputId: string };
  inputRoutingChannel: { inputId: string };
  outputRoutingType: { outputId: string };
  outputRoutingChannel: { outputId: string };
}

const call: CallTool = async (tool, args) => {
  return parseToolResultWithWarnings<AnyResult>(
    await ctx.client!.callTool({ name: tool, arguments: args }),
  );
};

async function seedClip(path: string): Promise<string> {
  const { data } = await call("ppal-create-clip", {
    path,
    notes: "C3 1|1",
    length: "1bar",
  });

  return data.id as string;
}

describe("hidden params at runtime", () => {
  beforeAll(async () => {
    const liveSet = (
      await call("ppal-read-live-set", { include: ["tracks", "scenes"] })
    ).data as unknown as {
      tracks: Array<{ id: string }>;
      scenes: Array<{ id: string }>;
    };

    state.trackId = liveSet.tracks[0]!.id;
    state.sceneId = liveSet.scenes[0]!.id;

    const routing = (
      await call("ppal-read-track", {
        path: `t${EMPTY_MIDI_TRACK}`,
        include: ["routings"],
      })
    ).data as unknown as TrackRouting;

    state.emptyTrackId = routing.id;
    state.inputRoutingTypeId = routing.inputRoutingType.inputId;
    state.inputRoutingChannelId = routing.inputRoutingChannel.inputId;
    state.outputRoutingTypeId = routing.outputRoutingType.outputId;
    state.outputRoutingChannelId = routing.outputRoutingChannel.outputId;

    state.clipId = await seedClip(`t${EMPTY_MIDI_TRACK}/s0`);
    state.deleteById = await seedClip(`t${RACKS_TRACK}/s0`);
    state.moveClipId = await seedClip(`t${EMPTY_MIDI_TRACK}/s6`);
    await call("ppal-update-clip", {
      id: state.moveClipId,
      name: "Moved By toSlot",
    });
    await seedClip(`t${RACKS_TRACK}/s1`);
    state.deviceId = (await call("ppal-read-device", { path: "t0/d0" })).data
      .id as string;

    const arrangement = await call("ppal-create-clip", {
      path: `t${EMPTY_MIDI_TRACK}`,
      arrangementStart: "69|1",
      notes: "C3 1|1",
      length: "1bar",
    });

    state.arrangementClipId = arrangement.data.id as string;

    // Its own clip: the update case below moves it, which re-creates it under a
    // new id, and the duplicate case needs a source that stays put.
    const movable = await call("ppal-create-clip", {
      path: `t${EMPTY_MIDI_TRACK}`,
      arrangementStart: "81|1",
      notes: "C3 1|1",
      length: "1bar",
    });

    state.moveArrangementClipId = movable.data.id as string;

    const splittable = await call("ppal-create-clip", {
      path: `t${EMPTY_MIDI_TRACK}`,
      arrangementStart: "101|1",
      notes: "C3 1|1\nC3 2|1",
      length: "2bar",
    });

    state.splitClipId = splittable.data.id as string;
  });

  it.each(CASES)("$tool honors $param", async ({ tool, args, verify }) => {
    const sent = args();
    const { data, warnings } = await call(tool, sent);

    for (const expected of expectedWarnings(tool, sent)) {
      expect(warnings).toContain(expected);
    }

    await verify?.(data, call);
  });

  // searchBatch is a retired action *value*, not a hidden param — it's kept out
  // of the action enum, not tagged via deprecatedParam/aliasParam — so it has
  // no entry in CASES and isn't covered by "has a case for every hidden param".
  it("still runs the fan-out for a caller on the retired searchBatch action", async () => {
    // One search answers ungrouped, the way a plain search does.
    const { data, warnings } = parseToolResultWithWarnings<{
      items?: unknown;
    }>(
      await ctx.client!.callTool({
        name: "ppal-library",
        arguments: {
          action: "searchBatch",
          searches: [{ query: "kick", limit: 1 }],
        },
      }),
    );

    expect(data.items).toBeDefined();
    expect(warnings).toStrictEqual([
      'WARNING: action "searchBatch" is deprecated and will be removed; use action "search" with searches instead',
    ]);
  });

  it("has a case for every hidden param", () => {
    const declared = Object.entries(hiddenByTool()).flatMap(([tool, params]) =>
      Object.keys(params).map((param) => `${tool}.${param}`),
    );
    const covered = new Set(CASES.map((c) => `${c.tool}.${c.param}`));

    expect(declared.filter((key) => !covered.has(key))).toStrictEqual([]);
  });
});
