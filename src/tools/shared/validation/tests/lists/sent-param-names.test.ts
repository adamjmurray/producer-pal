// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// An error about a target quotes the param the caller sent. A plain alias
// (`paths`, `ids`, a tool's own id spelling) is named as sent, not as the
// published param it stands in for.

import { describe, expect, it } from "vitest";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import { deleteObject } from "#src/tools/actions/delete/delete.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { readClip } from "#src/tools/clip/read/read-clip.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { readDevice } from "#src/tools/device/read/read-device.ts";
import { updateDevice } from "#src/tools/device/update/update-device.ts";
import { readScene } from "#src/tools/scene/read-scene.ts";
import { updateScene } from "#src/tools/scene/update-scene.ts";
import { playback } from "#src/tools/session/playback.ts";
import { select } from "#src/tools/session/select.ts";
import { readTrack } from "#src/tools/track/read/read-track.ts";
import { updateTrack } from "#src/tools/track/update/update-track.ts";

type Call = (args: Record<string, unknown>) => unknown;

/** One tool, the args that make a call otherwise valid, and a list it parses. */
type ToolCase = [name: string, call: Call, base: object, list: string];

const asCall = (fn: unknown): Call => fn as Call;

/** Every tool that takes `path` and its alias `paths`. */
const PATH_TOOLS: ToolCase[] = [
  ["update-clip", asCall(updateClip), { name: "x" }, "t0/s0,,t0/s1"],
  ["update-track", asCall(updateTrack), { name: "x" }, "t0,,t1"],
  ["update-scene", asCall(updateScene), { name: "x" }, "s0,,s1"],
  ["update-device", asCall(updateDevice), { name: "x" }, "t0/d0,,t0/d1"],
  ["delete", asCall(deleteObject), { type: "track" }, "t0,,t1"],
  ["duplicate", asCall(duplicate), { type: "track" }, "t0,,t1"],
  [
    "playback",
    asCall(playback),
    { action: "play-session-clips" },
    "t0/s0,,t0/s1",
  ],
  ["read-clip", asCall(readClip), {}, "t0/s0,,t0/s1"],
  ["read-track", asCall(readTrack), {}, "t0,,t1"],
  ["read-scene", asCall(readScene), {}, "s0,,s1"],
  ["read-device", asCall(readDevice), {}, "t0/d0,,t0/d1"],
];

/** Every tool that takes `id`, with its alias and a list it parses. */
const ID_TOOLS: Array<[...ToolCase, alias: string]> = [
  ["update-clip", asCall(updateClip), { name: "x" }, "1,,2", "ids"],
  ["update-track", asCall(updateTrack), { name: "x" }, "1,,2", "ids"],
  ["update-scene", asCall(updateScene), { name: "x" }, "1,,2", "ids"],
  ["update-device", asCall(updateDevice), { name: "x" }, "1,,2", "ids"],
  ["delete", asCall(deleteObject), { type: "track" }, "1,,2", "ids"],
  ["duplicate", asCall(duplicate), { type: "track" }, "1,,2", "ids"],
  [
    "playback",
    asCall(playback),
    { action: "play-session-clips" },
    "1,,2",
    "ids",
  ],
  ["read-clip", asCall(readClip), {}, "1,,2", "clipId"],
  ["read-track", asCall(readTrack), {}, "1,,2", "trackId"],
  ["read-scene", asCall(readScene), {}, "1,,2", "sceneId"],
  ["read-device", asCall(readDevice), {}, "1,,2", "deviceId"],
];

/** What a call refused with, whether the tool throws or rejects. */
async function refusal(call: Call, args: object): Promise<string | undefined> {
  try {
    await call(args as Record<string, unknown>);
  } catch (error) {
    return (error as Error).message;
  }

  return undefined;
}

/** What a call answered with, or the message it refused with. */
async function outcome(call: Call, args: object): Promise<string> {
  try {
    return JSON.stringify(await call(args as Record<string, unknown>));
  } catch (error) {
    return (error as Error).message;
  }
}

describe("path lists", () => {
  it.each(PATH_TOOLS)("%s names the param it was sent as", async (...tool) => {
    const [, call, base, list] = tool;

    expect(await refusal(call, { ...base, path: list })).toContain(
      `invalid path "${list}" - it has an empty entry`,
    );
    expect(await refusal(call, { ...base, paths: list })).toContain(
      `invalid paths "${list}" - it has an empty entry`,
    );
  });

  it.each(PATH_TOOLS)(
    "%s names an unparsable entry as sent",
    async (...tool) => {
      const [, call, base] = tool;

      expect(await refusal(call, { ...base, paths: "zzz" })).toMatch(
        /^invalid paths "zzz"/,
      );
    },
  );

  it.each(PATH_TOOLS.slice(0, 4))(
    "%s names the list that doesn't match the other lists as sent",
    async (...tool) => {
      const [, call, base] = tool;

      for (const [param, expected] of [
        ["path", "path names 2 entries but name names 3 entries"],
        ["paths", "paths names 2 entries but name names 3 entries"],
      ]) {
        const list = tool[3].replace(",,", ",");
        const args = { ...base, [param as string]: list, name: "a,b,c" };

        expect(await refusal(call, args)).toContain(expected);
      }
    },
  );
});

describe("id lists", () => {
  it.each(ID_TOOLS)("%s names the param it was sent as", async (...tool) => {
    const [, call, base, list, alias] = tool;

    expect(await refusal(call, { ...base, id: list })).toContain(
      `invalid id "${list}" - it has an empty entry`,
    );
    expect(await refusal(call, { ...base, [alias]: list })).toContain(
      `invalid ${alias} "${list}" - it has an empty entry`,
    );
  });

  // `delete` has nothing to say about an id that isn't there: it is deleted.
  it.each(ID_TOOLS.filter(([name]) => name !== "delete"))(
    "%s names an id that doesn't exist as sent",
    async (...tool) => {
      const [, call, base, , alias] = tool;

      mockNonExistentObjects();

      expect(await refusal(call, { ...base, id: "999" })).toContain(
        'id "999" does not exist',
      );
      expect(await refusal(call, { ...base, [alias]: "999" })).toContain(
        `${alias} "999" does not exist`,
      );
    },
  );

  it("names select's id aliases as sent", async () => {
    mockNonExistentObjects();

    for (const alias of ["trackId", "sceneId", "clipId", "deviceId"]) {
      expect(await refusal(asCall(select), { [alias]: "999" })).toBe(
        `${alias} "999" does not exist`,
      );
    }
  });
});

describe("a path that names nothing", () => {
  const MISSING: ToolCase[] = [
    ["update-clip", asCall(updateClip), { name: "x" }, "t9/s9,t8/s8"],
    ["update-track", asCall(updateTrack), { name: "x" }, "t9,t8"],
    ["update-scene", asCall(updateScene), { name: "x" }, "s9,s8"],
    ["update-device", asCall(updateDevice), { name: "x" }, "t9/d9,t8/d8"],
    ["duplicate", asCall(duplicate), { type: "track" }, "t9,t8"],
    ["read-track", asCall(readTrack), {}, "t9,t8"],
    ["read-scene", asCall(readScene), {}, "s9,s8"],
    ["read-device", asCall(readDevice), {}, "t9/d9,t8/d8"],
  ];

  it.each(MISSING)("%s names the param it was sent as", async (...tool) => {
    const [, call, base, list] = tool;

    mockNonExistentObjects();

    const sent = await outcome(call, { ...base, paths: list });
    const published = await outcome(call, { ...base, path: list });

    expect(sent).toMatch(/ paths \\"/);
    expect(published).toMatch(/ path \\"/);
    // Same answer, whichever spelling: only the name differs.
    expect(sent.replaceAll(" paths ", " path ")).toBe(published);
  });
});

describe("the other refusals about a path", () => {
  const REFUSALS: Array<[string, Call, object, string]> = [
    [
      "a take lane on a missing track (update-track)",
      asCall(updateTrack),
      { paths: "t9/l0", name: "x" },
      'no track at paths "t9/l0"',
    ],
    [
      "a take lane on a missing track (read-track)",
      asCall(readTrack),
      { paths: "t9/l0" },
      'nothing at paths "t9/l0"',
    ],
    [
      "a path beside sceneIndex",
      asCall(playback),
      { action: "play-scene", paths: "s1", sceneIndex: 2 },
      "paths names the scene on its own",
    ],
    [
      "a path that names no scene",
      asCall(playback),
      { action: "play-scene", paths: "t0" },
      'invalid paths "t0" - names no scene',
    ],
    [
      "a scene where clips are wanted",
      asCall(playback),
      { action: "play-session-clips", paths: "s1" },
      'invalid paths "s1" - names a scene',
    ],
    [
      "two scenes from one list",
      asCall(playback),
      { action: "play-scene", paths: "s1,s2" },
      'scene 1 from paths "s1", scene 2 from paths "s2"',
    ],
    [
      "a lane copied with nowhere to go",
      asCall(duplicate),
      { type: "track", paths: "t0/l0" },
      'paths "t0/l0" names a take lane',
    ],
    [
      "a wrong kind of path",
      asCall(deleteObject),
      { type: "device", paths: "t0" },
      'invalid paths "t0" - a track is not a device',
    ],
  ];

  it.each(REFUSALS)("names paths as sent for %s", async (...refused) => {
    const [, call, args, expected] = refused;

    mockNonExistentObjects();

    expect(await refusal(call, args)).toContain(expected);
  });
});
