// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { STANDARD_TOOL_DEFS } from "#src/mcp-server/create-mcp-server.ts";
import { createClip } from "#src/tools/clip/create/create-clip.ts";
import { readClip } from "#src/tools/clip/read/read-clip.ts";
import { deleteObject } from "#src/tools/actions/delete/delete.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { readDevice } from "#src/tools/device/read/read-device.ts";
import { updateDevice } from "#src/tools/device/update/update-device.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { createDevice } from "#src/tools/device/create/create-device.ts";
import { createScene } from "#src/tools/scene/create-scene.ts";
import { updateScene } from "#src/tools/scene/update-scene.ts";
import { updateTrack } from "#src/tools/track/update/update-track.ts";
import { readScene } from "#src/tools/scene/read-scene.ts";
import { playback } from "#src/tools/session/playback.ts";
import { select } from "#src/tools/session/select.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import { refuseNamedTwice } from "#src/tools/shared/helpers/param-presence.ts";
import { createTrack } from "#src/tools/track/create/create-track.ts";
import { readTrack } from "#src/tools/track/read/read-track.ts";

// A param that names the target on its own (`path`, `slot`, `devicePath`) and
// another that names it again (`trackIndex`, `takeLane`) are refused up front,
// in one wording, by every tool that takes both.

/** One pair a tool refuses: the param that names the target, and what it is sent with. */
interface Case {
  tool: string;
  call: (args: Record<string, unknown>) => unknown;
  /** The param that names the target on its own */
  param: string;
  value: string;
  noun: string;
  also: Record<string, number | string>;
  /** The note on the end of the message, when the refusal has one */
  hint?: string;
}

const SLOT = { param: "slot", value: "0/0" };
const BOTH = { trackIndex: 0, sceneIndex: 0 };

const CASES: Case[] = [
  {
    tool: "ppal-create-device",
    call: (args) => createDevice(args),
    param: "device",
    value: "Reverb",
    noun: "device",
    also: { deviceName: "Delay" },
    hint: "deviceName is deprecated",
  },
  {
    tool: "ppal-read-track",
    call: (args) => readTrack(args),
    param: "path",
    value: "t0",
    noun: "track",
    also: { trackIndex: 0 },
  },
  {
    tool: "ppal-read-scene",
    call: (args) => readScene(args),
    param: "path",
    value: "s0",
    noun: "scene",
    also: { sceneIndex: 0 },
  },
  {
    tool: "ppal-read-clip",
    call: (args) => readClip(args),
    param: "path",
    value: "t0/s0",
    noun: "clip",
    also: BOTH,
  },
  {
    tool: "ppal-read-clip",
    call: (args) => readClip(args),
    ...SLOT,
    noun: "clip",
    also: BOTH,
  },
  {
    tool: "ppal-create-track",
    call: (args) => createTrack(args),
    param: "path",
    value: "t+",
    noun: "destination",
    also: { trackIndex: 0 },
  },
  {
    tool: "ppal-create-scene",
    call: (args) => createScene(args),
    param: "path",
    value: "s+",
    noun: "destination",
    also: { sceneIndex: 0 },
  },
  {
    tool: "ppal-create-clip",
    call: (args) => createClip(args),
    param: "path",
    value: "t0/s0",
    noun: "destination",
    also: BOTH,
  },
  {
    tool: "ppal-create-clip",
    call: (args) => createClip(args),
    ...SLOT,
    noun: "destination",
    also: BOTH,
  },
  {
    tool: "ppal-create-clip",
    call: (args) => createClip(args),
    param: "path",
    value: "t0/l1[1|1]",
    noun: "take lane",
    also: { takeLane: 2 },
  },
  {
    tool: "ppal-select",
    call: (args) => select(args),
    param: "path",
    value: "t0/s0",
    noun: "target",
    also: BOTH,
  },
  {
    tool: "ppal-select",
    call: (args) => select(args),
    ...SLOT,
    noun: "target",
    also: BOTH,
  },
  {
    tool: "ppal-select",
    call: (args) => select(args),
    param: "devicePath",
    value: "t0/d0",
    noun: "target",
    also: BOTH,
  },
  {
    tool: "ppal-playback",
    call: (args) => playback({ action: "play-scene", ...args }),
    param: "path",
    value: "s0",
    noun: "scene",
    also: { sceneIndex: 0 },
  },
  {
    tool: "ppal-playback",
    call: (args) => playback({ action: "play-scene", ...args }),
    param: "slots",
    value: "0/0",
    noun: "scene",
    also: { sceneIndex: 0 },
  },
];

// Pairs refused where the meta test can't call the tool: duplicate reads its
// sources before it can tell toPath names a lane, so its own tests cover it.
const COVERED_ELSEWHERE = ["ppal-duplicate toPath takeLane"];

// Pairs that are not a target named twice: a slot names no take lane, so
// takeLane beside one has nothing to do, duplicate's path names the source
// while takeLane names where a copy goes, and create-device's path names where
// the device goes while deviceName names the device.
const NOT_NAMED_TWICE = [
  "ppal-create-clip slot takeLane",
  "ppal-duplicate toSlot takeLane",
  "ppal-duplicate path takeLane",
  "ppal-create-device path deviceName",
];

// The params that name a target on its own, and the ones that may name it again.
const NAMING_PARAMS = [
  "device",
  "path",
  "slot",
  "slots",
  "devicePath",
  "toPath",
  "toSlot",
];
const SECOND_NAMES = ["trackIndex", "sceneIndex", "takeLane", "deviceName"];

/** One tool that takes id and path with their plural and hidden spellings. */
interface TargetCase {
  tool: string;
  call: (args: Record<string, unknown>) => unknown;
  /** Args the call needs besides its targets */
  args?: Record<string, unknown>;
  /** The tool's own hidden id spelling, when it has one */
  idAlias?: string;
}

const TARGET_CASES: TargetCase[] = [
  { tool: "read-track", call: (a) => readTrack(a), idAlias: "trackId" },
  { tool: "read-scene", call: (a) => readScene(a), idAlias: "sceneId" },
  { tool: "read-clip", call: (a) => readClip(a), idAlias: "clipId" },
  { tool: "read-device", call: (a) => readDevice(a), idAlias: "deviceId" },
  { tool: "update-track", call: (a) => updateTrack(a), args: { name: "x" } },
  { tool: "update-scene", call: (a) => updateScene(a), args: { name: "x" } },
  { tool: "update-clip", call: (a) => updateClip(a), args: { name: "x" } },
  { tool: "update-device", call: (a) => updateDevice(a), args: { name: "x" } },
  {
    tool: "delete",
    call: (a) => deleteObject({ type: "track", ...a }),
    args: { type: "track" },
  },
  {
    tool: "duplicate",
    call: (a) => duplicate({ type: "track", ...a }),
    args: { type: "track" },
  },
  {
    tool: "playback",
    call: (a) => playback(a),
    args: { action: "stop-session-clips" },
  },
];

/**
 * Runs a tool call, sync or async, and returns the refusal it threw.
 * @param run - The call
 * @returns The error message, or null when the call did not refuse
 */
async function refusal(run: () => unknown): Promise<string | null> {
  try {
    await run();
  } catch (error) {
    return (error as Error).message;
  }

  return null;
}

describe("a target named twice", () => {
  it.each(CASES)(
    "$tool refuses $param with $also",
    async ({ call, param, value, noun, also, hint }) => {
      const sent = Object.keys(also).join(" or ");
      const note = hint == null ? "" : ` (${hint})`;

      expect(await refusal(() => call({ [param]: value, ...also }))).toBe(
        `${param} names the ${noun} on its own - don't send ${sent} with it${note}`,
      );
    },
  );

  // create-clip's slot with a bare sceneIndex fails for its own reason (no
  // track), so it is left out.
  it.each(
    CASES.filter(
      (c) =>
        Object.keys(c.also).length > 1 &&
        !(c.tool === "ppal-create-clip" && c.param === "slot"),
    ),
  )(
    "$tool lists only the params that were sent beside $param",
    async ({ call, param, value, noun }) => {
      expect(await refusal(() => call({ [param]: value, sceneIndex: 0 }))).toBe(
        `${param} names the ${noun} on its own - don't send sceneIndex with it`,
      );
    },
  );

  // The read tools take `paths` as a spelling of `path`, so it counts too.
  it.each([
    ["track", (args: Record<string, unknown>) => readTrack(args), "t0"],
    ["scene", (args: Record<string, unknown>) => readScene(args), "s0"],
    ["clip", (args: Record<string, unknown>) => readClip(args), "t0/s0"],
  ])(
    "read-%s refuses the paths alias sent with an index",
    async (noun, call, paths) => {
      const index = noun === "scene" ? "sceneIndex" : "trackIndex";

      expect(await refusal(() => call({ paths, [index]: 0 }))).toBe(
        `path names the ${noun} on its own - don't send ${index} with it`,
      );
    },
  );

  // A slot list with a bare trackIndex is a deliberate mix: session slots plus
  // an arrangement track. Only both halves of a slot name it twice.
  it("create-clip still takes a slot list beside a bare trackIndex", async () => {
    const refused = await refusal(() =>
      createClip({ slot: "0/0", trackIndex: 1 }),
    );

    expect(String(refused)).not.toMatch(/names the .* on its own/);
  });

  // Compares (tool, naming param, second param) triples: every pair a tool
  // publishes must be refused above, covered elsewhere, or named as not a
  // double naming. A listed tool that gains a new pairing fails here too.
  it("accounts for every published pair of a naming param and a second one", () => {
    const published = STANDARD_TOOL_DEFS.flatMap((def) => {
      const params = Object.keys(
        resolveToolSchema(def.toolOptions.inputSchema, {}).validating,
      );

      return NAMING_PARAMS.filter((p) => params.includes(p)).flatMap((first) =>
        SECOND_NAMES.filter((p) => params.includes(p)).map(
          (second) => `${def.toolName} ${first} ${second}`,
        ),
      );
    });
    const accounted = [
      ...CASES.flatMap((c) =>
        Object.keys(c.also).map((second) => `${c.tool} ${c.param} ${second}`),
      ),
      ...COVERED_ELSEWHERE,
      ...NOT_NAMED_TWICE,
    ];

    expect(published.toSorted()).toStrictEqual(
      [...new Set(accounted)].toSorted(),
    );
  });
});

// id beside ids (and the tool's own hidden id spelling), and path beside paths:
// two spellings of one arg, so the call is refused before any work, whatever
// the values.
describe("id and path beside their other spellings", () => {
  it.each(TARGET_CASES)(
    "$tool refuses id beside ids",
    async ({ call, args }) => {
      expect(await refusal(() => call({ ...args, id: "1", ids: "2" }))).toBe(
        "id names the target on its own - don't send ids with it",
      );
    },
  );

  it.each(TARGET_CASES)(
    "$tool refuses path beside paths",
    async ({ call, args }) => {
      expect(
        await refusal(() => call({ ...args, path: "t0", paths: "t1" })),
      ).toBe("path names the target on its own - don't send paths with it");
    },
  );

  it.each(TARGET_CASES.filter((c) => c.idAlias != null))(
    "$tool refuses id beside $idAlias",
    async ({ call, args, idAlias }) => {
      expect(
        await refusal(() =>
          call({ ...args, id: "1", [idAlias as string]: "2" }),
        ),
      ).toBe(`id names the target on its own - don't send ${idAlias} with it`);
    },
  );

  // The next tool to take ids, paths or a hidden id spelling has to join
  // TARGET_CASES. Select is left out: its id spellings each name a different
  // kind of object, so they are independent of one another.
  it("covers every tool that takes ids, paths or a hidden id spelling", () => {
    const aliases = ["trackId", "sceneId", "clipId", "deviceId"];
    const published = STANDARD_TOOL_DEFS.filter(
      (def) => def.toolName !== "ppal-select",
    ).flatMap((def) => {
      const params = Object.keys(
        resolveToolSchema(def.toolOptions.inputSchema, {}).validating,
      );

      return ["ids", "paths", ...aliases]
        .filter((param) => params.includes(param))
        .map((param) => `${def.toolName} ${param}`);
    });
    const accounted = TARGET_CASES.flatMap((c) => [
      `ppal-${c.tool} ids`,
      `ppal-${c.tool} paths`,
      ...(c.idAlias == null ? [] : [`ppal-${c.tool} ${c.idAlias}`]),
    ]);

    expect(published.toSorted()).toStrictEqual(accounted.toSorted());
  });

  // A param and its alias are never sent together, so the same value in both
  // is refused too.
  it.each(TARGET_CASES)(
    "$tool refuses the same id and path in both spellings",
    async ({ call, args }) => {
      expect(await refusal(() => call({ ...args, id: "1", ids: " 1 " }))).toBe(
        "id names the target on its own - don't send ids with it",
      );
      expect(
        await refusal(() => call({ ...args, path: "t0", paths: " t0 " })),
      ).toBe("path names the target on its own - don't send paths with it");
    },
  );
});

describe("refuseNamedTwice", () => {
  const also = { trackIndex: 0, sceneIndex: undefined };

  it("passes when the naming param was not sent", () => {
    expect(() =>
      refuseNamedTwice({ param: "path", value: undefined, noun: "clip", also }),
    ).not.toThrow();
  });

  it("passes when the naming param names nothing", () => {
    for (const value of ["  ", "null"]) {
      expect(() =>
        refuseNamedTwice({ param: "path", value, noun: "clip", also }),
      ).not.toThrow();
    }
  });

  it("passes when nothing was sent beside it", () => {
    expect(() =>
      refuseNamedTwice({
        param: "path",
        value: "t0",
        noun: "track",
        also: { trackIndex: undefined },
      }),
    ).not.toThrow();
  });

  it("counts an index of 0 as sent, and names the param", () => {
    expect(() =>
      refuseNamedTwice({ param: "slot", value: "0/0", noun: "clip", also }),
    ).toThrow("slot names the clip on its own - don't send trackIndex with it");
  });
});
