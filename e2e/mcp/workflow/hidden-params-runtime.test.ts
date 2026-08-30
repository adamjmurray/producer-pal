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
 * without a case below.
 *
 * Uses: e2e-test-set (t7 and t8 are empty MIDI tracks)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- workflow/hidden-params-runtime
 */
import { beforeAll, describe, expect, it } from "vitest";
import { STANDARD_TOOL_DEFS } from "#src/mcp-server/create-mcp-server.ts";
import {
  hiddenParamWarnings,
  type HiddenParamInfo,
} from "#src/tools/shared/tool-framework/hidden-param.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import {
  parseToolResultWithWarnings,
  setupMcpTestContext,
} from "../mcp-test-helpers";
import { EMPTY_MIDI_TRACK, RACKS_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext({ once: true });

interface AnyResult {
  id?: string;
  path?: string;
  name?: string;
  sceneIndex?: number;
  selectedTrack?: { id: string };
  selectedScene?: { id: string };
  selectedClip?: { id: string; path?: string };
  selectedDevice?: { id: string; path?: string };
  playing?: boolean;
}

interface Case {
  tool: string;
  param: string;
  args: () => Record<string, unknown>;
  verify?: (data: AnyResult) => void | Promise<void>;
}

const state = {
  trackId: "",
  sceneId: "",
  clipId: "",
  deviceId: "",
  deleteById: "",
  moveClipId: "",
  arrangementClipId: "",
};

/**
 * The hidden params each tool declares, keyed by tool name.
 * @returns Hidden-param info per tool
 */
function hiddenByTool(): Record<string, Record<string, HiddenParamInfo>> {
  return Object.fromEntries(
    STANDARD_TOOL_DEFS.map((def) => [
      def.toolName,
      resolveToolSchema(def.toolOptions.inputSchema, {}).hidden,
    ]),
  );
}

/**
 * The warnings the framework produces for a call. Aliases that fold onto the
 * same param are grouped into one line, so this is built from every hidden
 * param the call actually sent, not from the one under test.
 * @param tool - Tool name
 * @param args - The arguments the call sent
 * @returns The expected warning texts
 */
function expectedWarnings(
  tool: string,
  args: Record<string, unknown>,
): string[] {
  const hidden = hiddenByTool()[tool] ?? {};
  const used = Object.keys(hidden).filter((key) => key in args);

  return hiddenParamWarnings(tool, used, hidden);
}

async function call(
  tool: string,
  args: Record<string, unknown>,
): Promise<{ data: AnyResult; warnings: string[] }> {
  return parseToolResultWithWarnings<AnyResult>(
    await ctx.client!.callTool({ name: tool, arguments: args }),
  );
}

async function seedClip(path: string): Promise<string> {
  const { data } = await call("ppal-create-clip", {
    path,
    notes: "C3 1|1",
    length: "1bar",
  });

  return data.id as string;
}

const CASES: Case[] = [
  {
    tool: "ppal-read-track",
    param: "trackId",
    args: () => ({ trackId: state.trackId }),
    verify: (d) => expect(d.id).toBe(state.trackId),
  },
  {
    tool: "ppal-update-track",
    param: "ids",
    args: () => ({ ids: state.trackId, name: "Aliased Track" }),
    verify: (d) => expect(d.id).toBe(state.trackId),
  },
  {
    tool: "ppal-read-scene",
    param: "sceneId",
    args: () => ({ sceneId: state.sceneId }),
    verify: (d) => expect(d.id).toBe(state.sceneId),
  },
  {
    tool: "ppal-update-scene",
    param: "ids",
    args: () => ({ ids: state.sceneId, name: "Aliased Scene" }),
    verify: (d) => expect(d.id).toBe(state.sceneId),
  },
  {
    tool: "ppal-read-clip",
    param: "clipId",
    args: () => ({ clipId: state.clipId }),
    verify: (d) => expect(d.id).toBe(state.clipId),
  },
  {
    tool: "ppal-read-clip",
    param: "slot",
    args: () => ({ slot: `${EMPTY_MIDI_TRACK}/0` }),
    verify: (d) => expect(d.id).toBe(state.clipId),
  },
  {
    tool: "ppal-read-clip",
    param: "trackIndex",
    args: () => ({ trackIndex: EMPTY_MIDI_TRACK, sceneIndex: 0 }),
    verify: (d) => expect(d.id).toBe(state.clipId),
  },
  {
    tool: "ppal-read-clip",
    param: "sceneIndex",
    args: () => ({ trackIndex: EMPTY_MIDI_TRACK, sceneIndex: 0 }),
    verify: (d) => expect(d.id).toBe(state.clipId),
  },
  {
    tool: "ppal-create-clip",
    param: "slot",
    args: () => ({
      slot: `${EMPTY_MIDI_TRACK}/2`,
      notes: "C3 1|1",
      length: "1bar",
    }),
    verify: (d) => expect(d.path).toBe(`t${EMPTY_MIDI_TRACK}/s2`),
  },
  {
    tool: "ppal-create-clip",
    param: "trackIndex",
    args: () => ({
      trackIndex: EMPTY_MIDI_TRACK,
      sceneIndex: 3,
      notes: "C3 1|1",
      length: "1bar",
    }),
    verify: (d) => expect(d.path).toBe(`t${EMPTY_MIDI_TRACK}/s3`),
  },
  {
    tool: "ppal-create-clip",
    param: "sceneIndex",
    args: () => ({
      trackIndex: EMPTY_MIDI_TRACK,
      sceneIndex: 4,
      notes: "C3 1|1",
      length: "1bar",
    }),
    verify: (d) => expect(d.path).toBe(`t${EMPTY_MIDI_TRACK}/s4`),
  },
  {
    tool: "ppal-create-clip",
    param: "takeLane",
    args: () => ({
      path: `t${EMPTY_MIDI_TRACK}`,
      arrangementStart: "65|1",
      takeLane: 2,
      notes: "C3 1|1",
      length: "1bar",
    }),
    verify: (d) => expect(d.path).toBe(`t${EMPTY_MIDI_TRACK}/l1`),
  },
  {
    tool: "ppal-update-clip",
    param: "ids",
    args: () => ({ ids: state.clipId, name: "Aliased Clip" }),
    verify: (d) => expect(d.id).toBe(state.clipId),
  },
  {
    tool: "ppal-update-clip",
    param: "paths",
    args: () => ({ paths: `t${EMPTY_MIDI_TRACK}/s0`, name: "Path Aliased" }),
    verify: (d) => expect(d.id).toBe(state.clipId),
  },
  {
    tool: "ppal-update-clip",
    param: "toSlot",
    // A move gets its own clip: Live hands the destination a new id, and the
    // source slot is left empty for every later case that reads t8/s0.
    args: () => ({ id: state.moveClipId, toSlot: `${RACKS_TRACK}/5` }),
    verify: async () => {
      const moved = await call("ppal-read-clip", {
        path: `t${RACKS_TRACK}/s5`,
      });

      expect(moved.data.name).toBe("Moved By toSlot");
    },
  },
  {
    tool: "ppal-update-clip",
    param: "split",
    args: () => ({ path: `t${EMPTY_MIDI_TRACK}/s2`, split: "1bar" }),
  },
  {
    tool: "ppal-read-device",
    param: "deviceId",
    args: () => ({ deviceId: state.deviceId }),
    verify: (d) => expect(d.id).toBe(state.deviceId),
  },
  {
    tool: "ppal-update-device",
    param: "ids",
    args: () => ({ ids: state.deviceId, name: "Aliased Device" }),
    verify: (d) => expect(d.id).toBe(state.deviceId),
  },
  {
    tool: "ppal-update-device",
    param: "paths",
    args: () => ({ paths: "t0/d0", name: "Path Aliased Device" }),
    verify: (d) => expect(d.id).toBe(state.deviceId),
  },
  {
    tool: "ppal-delete",
    param: "ids",
    args: () => ({ type: "clip", ids: state.deleteById }),
  },
  {
    tool: "ppal-delete",
    param: "paths",
    args: () => ({ type: "clip", paths: `t${RACKS_TRACK}/s1` }),
  },
  {
    tool: "ppal-duplicate",
    param: "ids",
    args: () => ({
      type: "clip",
      ids: state.clipId,
      toPath: `t${RACKS_TRACK}/s6`,
    }),
    verify: (d) => expect(d.path).toBe(`t${RACKS_TRACK}/s6`),
  },
  {
    tool: "ppal-duplicate",
    param: "toSlot",
    args: () => ({
      type: "clip",
      id: state.clipId,
      toSlot: `${RACKS_TRACK}/7`,
    }),
    verify: (d) => expect(d.path).toBe(`t${RACKS_TRACK}/s7`),
  },
  {
    tool: "ppal-duplicate",
    param: "takeLane",
    args: () => ({
      type: "clip",
      id: state.arrangementClipId,
      arrangementStart: "73|1",
      takeLane: 2,
    }),
  },
  {
    tool: "ppal-select",
    param: "trackId",
    args: () => ({ trackId: `id ${state.trackId}` }),
    verify: (d) => expect(d.selectedTrack?.id).toBe(state.trackId),
  },
  {
    tool: "ppal-select",
    param: "sceneId",
    args: () => ({ sceneId: `id ${state.sceneId}` }),
    verify: (d) => expect(d.selectedScene?.id).toBe(state.sceneId),
  },
  {
    tool: "ppal-select",
    param: "clipId",
    args: () => ({ clipId: `id ${state.clipId}` }),
    verify: (d) => expect(d.selectedClip?.id).toBe(state.clipId),
  },
  {
    tool: "ppal-select",
    param: "deviceId",
    args: () => ({ deviceId: `id ${state.deviceId}` }),
    verify: (d) => expect(d.selectedDevice?.id).toBe(state.deviceId),
  },
  {
    tool: "ppal-select",
    param: "slot",
    args: () => ({ slot: `${EMPTY_MIDI_TRACK}/0` }),
    verify: (d) => expect(d.selectedClip?.path).toBe(`t${EMPTY_MIDI_TRACK}/s0`),
  },
  {
    tool: "ppal-select",
    param: "devicePath",
    args: () => ({ devicePath: "t0/d0" }),
    verify: (d) => expect(d.selectedDevice?.path).toBe("t0/d0"),
  },
  {
    tool: "ppal-playback",
    param: "ids",
    args: () => ({ action: "play-session-clips", ids: state.clipId }),
    verify: (d) => expect(d.playing).toBe(true),
  },
  {
    tool: "ppal-playback",
    param: "paths",
    args: () => ({
      action: "stop-session-clips",
      paths: `t${EMPTY_MIDI_TRACK}/s0`,
    }),
  },
  {
    tool: "ppal-playback",
    param: "slots",
    args: () => ({
      action: "play-session-clips",
      slots: `${EMPTY_MIDI_TRACK}/0`,
    }),
    verify: (d) => expect(d.playing).toBe(true),
  },
];

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
  });

  it.each(CASES)("$tool honors $param", async ({ tool, args, verify }) => {
    const sent = args();
    const { data, warnings } = await call(tool, sent);

    for (const expected of expectedWarnings(tool, sent)) {
      expect(warnings).toContain(expected);
    }

    await verify?.(data);
  });

  it("has a case for every hidden param", () => {
    const declared = Object.entries(hiddenByTool()).flatMap(([tool, params]) =>
      Object.keys(params).map((param) => `${tool}.${param}`),
    );
    const covered = new Set(CASES.map((c) => `${c.tool}.${c.param}`));

    expect(declared.filter((key) => !covered.has(key))).toStrictEqual([]);
  });
});
