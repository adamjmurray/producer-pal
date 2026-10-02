// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// One case per hidden param, for the suite that calls each one for real.

import { expect } from "vitest";
import { EMPTY_MIDI_TRACK, RACKS_TRACK } from "../../e2e-test-set.ts";

export interface AnyResult {
  id?: string;
  path?: string;
  name?: string;
  type?: string;
  trackIndex?: number;
  sceneIndex?: number;
  selectedTrack?: { id: string; path?: string };
  selectedScene?: { id: string };
  selectedClip?: { id: string; path?: string };
  selectedDevice?: { id: string; path?: string };
  playing?: boolean;
  startTime?: string;
  scene?: { id: string; path?: string };
  loop?: boolean;
  loopStart?: string;
  loopEnd?: string;
  takeLanes?: { path: string; name: string }[];
}

/** Calls a tool and parses its result, the way the suite does. */
export type CallTool = (
  tool: string,
  args: Record<string, unknown>,
) => Promise<{ data: AnyResult; warnings: string[] }>;

export interface Case {
  tool: string;
  param: string;
  args: () => Record<string, unknown>;
  // `call` lets a case read back what it wrote.
  verify?: (data: AnyResult, call: CallTool) => void | Promise<void>;
}

export const state = {
  trackId: "",
  sceneId: "",
  clipId: "",
  deviceId: "",
  deleteById: "",
  moveClipId: "",
  arrangementClipId: "",
  moveArrangementClipId: "",
  splitClipId: "",
  emptyTrackId: "",
  // The routing a deprecated *Id param is set back to. Writing the value the
  // track already holds exercises the param without moving t8's routing, which
  // the routing suite reads as it found it.
  inputRoutingTypeId: "",
  inputRoutingChannelId: "",
  outputRoutingTypeId: "",
  outputRoutingChannelId: "",
};

// Tool names, spelled once.
const READ_TRACK = "ppal-read-track";
const CREATE_TRACK = "ppal-create-track";
const UPDATE_TRACK = "ppal-update-track";
const READ_SCENE = "ppal-read-scene";
const CREATE_SCENE = "ppal-create-scene";
const UPDATE_SCENE = "ppal-update-scene";
const READ_CLIP = "ppal-read-clip";
const CREATE_CLIP = "ppal-create-clip";
const UPDATE_CLIP = "ppal-update-clip";
const CREATE_DEVICE = "ppal-create-device";
const READ_DEVICE = "ppal-read-device";
const UPDATE_DEVICE = "ppal-update-device";
const DELETE = "ppal-delete";
const DUPLICATE = "ppal-duplicate";
const SELECT = "ppal-select";
const PLAYBACK = "ppal-playback";
const LIBRARY = "ppal-library";

export const CASES: Case[] = [
  {
    tool: READ_TRACK,
    param: "trackId",
    args: () => ({ trackId: state.trackId }),
    verify: (d) => expect(d.id).toBe(state.trackId),
  },
  ...addressAliasCases(READ_TRACK, "trackId", "t0"),
  {
    tool: READ_TRACK,
    param: "trackIndex",
    args: () => ({ trackIndex: 0 }),
    verify: (d) => expect(d.id).toBe(state.trackId),
  },
  {
    tool: READ_TRACK,
    param: "trackType",
    args: () => ({ trackType: "master" }),
    verify: (d) => expect(d.path).toBe("mt"),
  },
  {
    tool: CREATE_TRACK,
    param: "trackIndex",
    // -1 appends, so the indexes every other case addresses stay put.
    args: () => ({ trackIndex: -1, name: "Hidden Param Track" }),
    verify: async (d, call) => {
      const created = await call(READ_TRACK, { id: d.id });

      expect(created.data.name).toBe("Hidden Param Track");
    },
  },
  {
    tool: CREATE_TRACK,
    param: "count",
    // A path list replaced it, but one path plus count still appends.
    args: () => ({ path: "t+", count: 2, name: "Counted Track" }),
    verify: (d) => expect(d as unknown as AnyResult[]).toHaveLength(2),
  },
  ...addressAliasCases(
    UPDATE_TRACK,
    "trackId",
    "t0",
    "Aliased Track",
    "Path Aliased Track",
  ),
  {
    tool: UPDATE_TRACK,
    param: "inputRoutingTypeId",
    args: () => ({
      id: state.emptyTrackId,
      inputRoutingTypeId: state.inputRoutingTypeId,
    }),
    verify: (d) => expect(d.id).toBe(state.emptyTrackId),
  },
  {
    tool: UPDATE_TRACK,
    param: "inputRoutingChannelId",
    args: () => ({
      id: state.emptyTrackId,
      inputRoutingChannelId: state.inputRoutingChannelId,
    }),
    verify: (d) => expect(d.id).toBe(state.emptyTrackId),
  },
  {
    tool: UPDATE_TRACK,
    param: "outputRoutingTypeId",
    args: () => ({
      id: state.emptyTrackId,
      outputRoutingTypeId: state.outputRoutingTypeId,
    }),
    verify: (d) => expect(d.id).toBe(state.emptyTrackId),
  },
  {
    tool: UPDATE_TRACK,
    param: "outputRoutingChannelId",
    args: () => ({
      id: state.emptyTrackId,
      outputRoutingChannelId: state.outputRoutingChannelId,
    }),
    verify: (d) => expect(d.id).toBe(state.emptyTrackId),
  },
  {
    tool: READ_SCENE,
    param: "sceneId",
    args: () => ({ sceneId: state.sceneId }),
    verify: (d) => expect(d.id).toBe(state.sceneId),
  },
  ...addressAliasCases(READ_SCENE, "sceneId", "s0"),
  {
    tool: READ_SCENE,
    param: "sceneIndex",
    args: () => ({ sceneIndex: 0 }),
    verify: (d) => expect(d.id).toBe(state.sceneId),
  },
  {
    tool: CREATE_SCENE,
    param: "sceneIndex",
    // The Set has s0-s7, so 8 appends and shifts nothing.
    args: () => ({ sceneIndex: 8, name: "Hidden Param Scene" }),
    verify: (d) => expect(d.path).toBe("s8"),
  },
  {
    tool: CREATE_SCENE,
    param: "count",
    // A path list replaced it, but one path plus count still appends.
    args: () => ({ path: "s+", count: 2, name: "Counted Scene" }),
    verify: (d) => expect(d as unknown as AnyResult[]).toHaveLength(2),
  },
  ...addressAliasCases(
    UPDATE_SCENE,
    "sceneId",
    "s0",
    "Aliased Scene",
    "Path Aliased Scene",
  ),
  {
    tool: READ_CLIP,
    param: "clipId",
    args: () => ({ clipId: state.clipId }),
    verify: (d) => expect(d.id).toBe(state.clipId),
  },
  ...addressAliasCases(READ_CLIP, "clipId", `t${EMPTY_MIDI_TRACK}/s0`),
  {
    tool: READ_CLIP,
    param: "slot",
    args: () => ({ slot: `${EMPTY_MIDI_TRACK}/0` }),
    verify: (d) => expect(d.id).toBe(state.clipId),
  },
  {
    tool: READ_CLIP,
    param: "trackIndex",
    args: () => ({ trackIndex: EMPTY_MIDI_TRACK, sceneIndex: 0 }),
    verify: (d) => expect(d.id).toBe(state.clipId),
  },
  {
    tool: READ_CLIP,
    param: "sceneIndex",
    args: () => ({ trackIndex: EMPTY_MIDI_TRACK, sceneIndex: 0 }),
    verify: (d) => expect(d.id).toBe(state.clipId),
  },
  {
    tool: CREATE_CLIP,
    param: "slot",
    args: () => ({
      slot: `${EMPTY_MIDI_TRACK}/2`,
      notes: "C3 1|1",
      length: "1bar",
    }),
    verify: (d) => expect(d.path).toBe(`t${EMPTY_MIDI_TRACK}/s2`),
  },
  {
    tool: CREATE_CLIP,
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
    tool: CREATE_CLIP,
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
    tool: CREATE_CLIP,
    param: "takeLane",
    args: () => ({
      path: `t${EMPTY_MIDI_TRACK}`,
      arrangementStart: "65|1",
      takeLane: 2,
      notes: "C3 1|1",
      length: "1bar",
    }),
    verify: (d) => expect(d.path).toBe(`t${EMPTY_MIDI_TRACK}/l1[65|1]`),
  },
  {
    tool: CREATE_CLIP,
    param: "takeLaneName",
    args: () => ({
      path: `t${EMPTY_MIDI_TRACK}/l2[93|1]`,
      takeLaneName: "Named Create Lane",
      notes: "C3 1|1",
      length: "1bar",
    }),
    verify: async (_d, call) => {
      expect(await laneName(call, `t${EMPTY_MIDI_TRACK}/l2`)).toBe(
        "Named Create Lane",
      );
    },
  },
  {
    tool: CREATE_CLIP,
    param: "arrangementStart",
    args: () => ({
      path: `t${EMPTY_MIDI_TRACK}`,
      arrangementStart: "77|1",
      notes: "C3 1|1",
      length: "1bar",
    }),
    verify: (d) => expect(d.path).toBe(`t${EMPTY_MIDI_TRACK}[77|1]`),
  },
  ...addressAliasCases(
    UPDATE_CLIP,
    "clipId",
    `t${EMPTY_MIDI_TRACK}/s0`,
    "Aliased Clip",
    "Path Aliased",
  ),
  {
    tool: UPDATE_CLIP,
    param: "toSlot",
    // A move gets its own clip: Live hands the destination a new id, and the
    // source slot is left empty for every later case that reads t8/s0.
    args: () => ({ id: state.moveClipId, toSlot: `${RACKS_TRACK}/5` }),
    verify: async (_d, call) => {
      const moved = await call(READ_CLIP, {
        path: `t${RACKS_TRACK}/s5`,
      });

      expect(moved.data.name).toBe("Moved By toSlot");
    },
  },
  {
    tool: UPDATE_CLIP,
    param: "split",
    // Positions are clip-relative: 2|1 cuts the 2-bar clip at 101|1 in half.
    // A session clip won't do — a lone split on one is refused.
    args: () => ({ id: state.splitClipId, split: "2|1" }),
    verify: (d) =>
      expect((d as unknown as AnyResult[]).map((c) => c.path)).toStrictEqual([
        `t${EMPTY_MIDI_TRACK}[101|1]`,
        `t${EMPTY_MIDI_TRACK}[102|1]`,
      ]),
  },
  {
    tool: UPDATE_CLIP,
    param: "arrangementStart",
    // A move re-creates the clip, so the id changes — the path is what says it
    // landed.
    args: () => ({
      id: state.moveArrangementClipId,
      arrangementStart: "85|1",
    }),
    verify: (d) => expect(d.path).toBe(`t${EMPTY_MIDI_TRACK}[85|1]`),
  },
  {
    tool: CREATE_DEVICE,
    param: "deviceName",
    args: () => ({
      deviceName: "Arpeggiator",
      path: `t${EMPTY_MIDI_TRACK}/d+`,
    }),
    verify: async (d, call) => {
      const created = await call(READ_DEVICE, { path: d.path });

      expect(created.data.type).toContain("Arpeggiator");
    },
  },
  {
    tool: READ_DEVICE,
    param: "deviceId",
    args: () => ({ deviceId: state.deviceId }),
    verify: (d) => expect(d.id).toBe(state.deviceId),
  },
  ...addressAliasCases(READ_DEVICE, "deviceId", "t0/d0"),
  ...addressAliasCases(
    UPDATE_DEVICE,
    "deviceId",
    "t0/d0",
    "Aliased Device",
    "Path Aliased Device",
  ),
  {
    tool: DELETE,
    param: "ids",
    args: () => ({ type: "clip", ids: state.deleteById }),
  },
  {
    tool: DELETE,
    param: "paths",
    args: () => ({ type: "clip", paths: `t${RACKS_TRACK}/s1` }),
  },
  {
    tool: DUPLICATE,
    param: "ids",
    args: () => ({
      type: "clip",
      ids: state.clipId,
      toPath: `t${RACKS_TRACK}/s6`,
    }),
    verify: (d) => expect(d.path).toBe(`t${RACKS_TRACK}/s6`),
  },
  {
    tool: DUPLICATE,
    param: "paths",
    args: () => ({
      type: "clip",
      paths: `t${EMPTY_MIDI_TRACK}/s0`,
      toPath: `t${EMPTY_MIDI_TRACK}/s5`,
    }),
    verify: (d) => expect(d.path).toBe(`t${EMPTY_MIDI_TRACK}/s5`),
  },
  {
    tool: DUPLICATE,
    param: "toSlot",
    args: () => ({
      type: "clip",
      id: state.clipId,
      toSlot: `${RACKS_TRACK}/7`,
    }),
    verify: (d) => expect(d.path).toBe(`t${RACKS_TRACK}/s7`),
  },
  {
    tool: DUPLICATE,
    param: "takeLane",
    args: () => ({
      type: "clip",
      id: state.arrangementClipId,
      arrangementStart: "73|1",
      takeLane: 2,
    }),
  },
  {
    tool: DUPLICATE,
    param: "takeLaneName",
    args: () => ({
      type: "clip",
      id: state.arrangementClipId,
      toPath: `t${EMPTY_MIDI_TRACK}/l3[97|1]`,
      takeLaneName: "Named Duplicate Lane",
    }),
    verify: async (_d, call) => {
      expect(await laneName(call, `t${EMPTY_MIDI_TRACK}/l3`)).toBe(
        "Named Duplicate Lane",
      );
    },
  },
  {
    tool: DUPLICATE,
    param: "arrangementStart",
    args: () => ({
      type: "clip",
      id: state.arrangementClipId,
      arrangementStart: "89|1",
    }),
    verify: (d) => expect(d.path).toBe(`t${EMPTY_MIDI_TRACK}[89|1]`),
  },
  {
    tool: DUPLICATE,
    param: "locator",
    // Bridge is at 33|1 in the e2e test set, clear of the bars the arrangement
    // cases above use.
    args: () => ({
      type: "clip",
      id: state.arrangementClipId,
      locator: "Bridge",
    }),
    verify: (d) => expect(d.path).toBe(`t${EMPTY_MIDI_TRACK}[33|1]`),
  },
  {
    tool: SELECT,
    param: "trackId",
    args: () => ({ trackId: `id ${state.trackId}` }),
    verify: (d) => expect(d.selectedTrack?.id).toBe(state.trackId),
  },
  {
    tool: SELECT,
    param: "sceneId",
    args: () => ({ sceneId: `id ${state.sceneId}` }),
    verify: (d) => expect(d.selectedScene?.id).toBe(state.sceneId),
  },
  {
    tool: SELECT,
    param: "clipId",
    args: () => ({ clipId: `id ${state.clipId}` }),
    verify: (d) => expect(d.selectedClip?.id).toBe(state.clipId),
  },
  {
    tool: SELECT,
    param: "deviceId",
    args: () => ({ deviceId: `id ${state.deviceId}` }),
    verify: (d) => expect(d.selectedDevice?.id).toBe(state.deviceId),
  },
  {
    tool: SELECT,
    param: "trackIndex",
    args: () => ({ trackIndex: 0 }),
    verify: (d) => expect(d.selectedTrack?.id).toBe(state.trackId),
  },
  {
    tool: SELECT,
    param: "trackType",
    args: () => ({ trackType: "master" }),
    verify: (d) => expect(d.selectedTrack?.path).toBe("mt"),
  },
  {
    tool: SELECT,
    param: "sceneIndex",
    args: () => ({ sceneIndex: 0 }),
    verify: (d) => expect(d.selectedScene?.id).toBe(state.sceneId),
  },
  {
    tool: SELECT,
    param: "slot",
    args: () => ({ slot: `${EMPTY_MIDI_TRACK}/0` }),
    verify: (d) => expect(d.selectedClip?.path).toBe(`t${EMPTY_MIDI_TRACK}/s0`),
  },
  {
    tool: SELECT,
    param: "devicePath",
    args: () => ({ devicePath: "t0/d0" }),
    verify: (d) => expect(d.selectedDevice?.path).toBe("t0/d0"),
  },
  // The start position is all startLocator sets, and only the arrangement
  // actions report it — hence play-arrangement.
  {
    tool: PLAYBACK,
    param: "startLocator",
    args: () => ({ action: "play-arrangement", startLocator: "Verse" }),
    verify: (d) => expect(d.startTime).toBe("9|1"),
  },
  {
    tool: PLAYBACK,
    param: "ids",
    args: () => ({ action: "play-session-clips", ids: state.clipId }),
    verify: (d) => expect(d.playing).toBe(true),
  },
  {
    tool: PLAYBACK,
    param: "paths",
    args: () => ({
      action: "stop-session-clips",
      paths: `t${EMPTY_MIDI_TRACK}/s0`,
    }),
  },
  {
    tool: PLAYBACK,
    param: "slots",
    args: () => ({
      action: "play-session-clips",
      slots: `${EMPTY_MIDI_TRACK}/0`,
    }),
    verify: (d) => expect(d.playing).toBe(true),
  },
  // The retired locator halves took a bare name where the param they folded
  // onto takes "loc:<name>". Verse is 9|1 and Bridge 33|1 in the e2e test set.
  // The call names both ends, so it reports neither: the read-back is what
  // shows the folded locator resolved. The two cases set different spans, so
  // neither passes on the loop the other left.
  {
    tool: PLAYBACK,
    param: "loopStartLocator",
    args: () => ({
      action: "update-arrangement",
      loop: true,
      loopStartLocator: "Verse",
      loopEnd: "33|1",
    }),
    verify: (_d, call) => expectArrangementLoop(call, "9|1", "33|1"),
  },
  {
    tool: PLAYBACK,
    param: "loopEndLocator",
    args: () => ({
      action: "update-arrangement",
      loop: true,
      loopStart: "17|1",
      loopEndLocator: "Bridge",
    }),
    verify: (_d, call) => expectArrangementLoop(call, "17|1", "33|1"),
  },
  {
    tool: PLAYBACK,
    param: "sceneIndex",
    args: () => ({ action: "play-scene", sceneIndex: 0 }),
    verify: (d) => expect(d.scene?.path).toBe("s0"),
  },
  {
    tool: LIBRARY,
    param: "queries",
    args: () => ({ action: "search", queries: [{ query: "kick", limit: 1 }] }),
  },
];

// --- Helpers below main exports ---

/**
 * Read the arrangement loop back with a second call, then stop. A call that
 * sets the loop reports none of it, and `live_set loop` doesn't read back
 * inside the request that wrote it, so a later call is the only witness.
 * @param call - Calls a tool
 * @param start - The loopStart the write should have landed on
 * @param end - The loopEnd the write should have landed on
 */
async function expectArrangementLoop(
  call: CallTool,
  start: string,
  end: string,
): Promise<void> {
  const playback = (action: string) => call(PLAYBACK, { action });
  const { data } = await playback("play-arrangement");

  expect(data.loopStart).toBe(start);
  expect(data.loopEnd).toBe(end);

  await playback("stop");
}

/**
 * The name a fresh lane got. takeLaneName only names a lane the call created,
 * so the case must target a lane index the track doesn't have yet.
 * @param call - Calls a tool
 * @param lane - The lane path to look up
 * @returns The lane's name
 */
async function laneName(
  call: CallTool,
  lane: string,
): Promise<string | undefined> {
  const { data } = await call(READ_TRACK, {
    path: `t${EMPTY_MIDI_TRACK}`,
    include: ["arrangement-clips"],
  });

  return data.takeLanes?.find((l) => l.path === lane)?.name;
}

/**
 * The ids and paths cases for a tool addressed by one id or path. Each resolves
 * to the object whose id is in `state[key]`.
 * @param tool - Tool name
 * @param key - The state field holding the target's id
 * @param path - The target's path
 * @param idName - A name to write in the ids case, for update tools
 * @param pathName - A name to write in the paths case, for update tools
 * @returns The two cases
 */
function addressAliasCases(
  tool: string,
  key: "trackId" | "sceneId" | "clipId" | "deviceId",
  path: string,
  idName?: string,
  pathName?: string,
): Case[] {
  const named = (name?: string) => (name == null ? {} : { name });
  const verify = (d: AnyResult) => expect(d.id).toBe(state[key]);

  return [
    {
      tool,
      param: "ids",
      args: () => ({ ids: state[key], ...named(idName) }),
      verify,
    },
    {
      tool,
      param: "paths",
      args: () => ({ paths: path, ...named(pathName) }),
      verify,
    },
  ];
}
