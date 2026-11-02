// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  deleteMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { namedTargets } from "#src/tools/shared/validation/lists/named-targets.ts";
import { type LiveObjectType } from "#src/types/live-object-types.ts";
import {
  beginWarningCapture,
  endWarningCapture,
} from "#src/shared/max/v8-warning-capture.ts";
import { runWrite } from "../write-pipeline.ts";
import { type Locate, type WriteSpec } from "../write-pipeline-types.ts";
import { whereObjectIs } from "../where-object-is.ts";

/** What a toy call finds in the Set, by path, at the start and by the end. */
interface World {
  /** The caller's paths, comma-separated */
  paths: string;
  /** What each path named at the start; a path left out is unknown */
  atStart: Record<string, string | null>;
  /** Paths whose target is skipped before any write */
  skipped?: string[];
  /** Paths whose write throws before anything lands */
  fails?: string[];
  /** What each path names once the writes are done */
  now: Record<string, string | null>;
  /** Where each id sits by then; an id left out is gone */
  where: Record<string, { path: string; noun: string }>;
}

/**
 * A toy tool that writes nothing but answers from a world that has already
 * moved.
 * @param world - The call, and what it finds
 * @param lookups - Replaces the `locate` hooks
 * @returns The spec
 */
function pathToy(
  world: World,
  lookups?: Partial<Locate<World>>,
): WriteSpec<World, World, undefined, World, object> {
  return {
    tool: "toy",
    words: { rerun: "toy" },
    parse: (call) => call,
    targets: (call) =>
      namedTargets({ path: call.paths }).map((named) =>
        call.skipped?.includes(named.value) === true
          ? { named, atStart: call.atStart[named.value], skip: "not there" }
          : {
              named,
              atStart: call.atStart[named.value],
              key: named.value,
              data: undefined,
            },
      ),
    check: (call) => call,
    write: ({ named }, { checked }) => {
      if (checked.fails?.includes(named.value) === true) {
        throw new Error("refused");
      }

      return { path: named.value, wrote: true };
    },
    locate: {
      idAt: (path) => world.now[path] ?? null,
      whereIs: (id) => world.where[id],
      ...lookups,
    },
  };
}

/**
 * Run the toy tool against a world.
 * @param world - The call and what it finds
 * @param lookups - Replaces the `locate` hooks
 * @returns What the call answered
 */
function run(world: World, lookups?: Partial<Locate<World>>): unknown {
  return runWrite(pathToy(world, lookups), world);
}

const MOVED: World = {
  paths: "a,b",
  atStart: { a: "id1", b: "id2" },
  fails: ["b"],
  // a's write moved b along: b's path now names a different object.
  now: { a: "id1", b: "id9" },
  where: { id2: { path: "c", noun: "chain" } },
};

describe("runWrite: a skip whose path names something else by the end", () => {
  it("says where the object is now, and its id", () => {
    expect(run(MOVED)).toStrictEqual([
      { path: "a", wrote: true },
      {
        path: "b",
        ok: false,
        detail: "refused; that chain is now c (id id2)",
      },
    ]);
  });

  it("leaves the entry alone when the path still names the same object", () => {
    expect(run({ ...MOVED, now: { a: "id1", b: "id2" } })).toStrictEqual([
      { path: "a", wrote: true },
      { path: "b", ok: false, detail: "refused" },
    ]);
  });

  it("says the path was empty when the call began, if it names something now", () => {
    const world: World = {
      ...MOVED,
      atStart: { a: "id1", b: null },
      skipped: ["b"],
      now: { a: "id1", b: "id9" },
    };

    expect(run(world)).toStrictEqual([
      { path: "a", wrote: true },
      {
        path: "b",
        ok: false,
        detail: "not there; nothing was there when the call began",
      },
    ]);
  });

  it("leaves a path that was empty and still is", () => {
    const world: World = {
      ...MOVED,
      atStart: { a: "id1", b: null },
      skipped: ["b"],
      now: { a: "id1", b: null },
    };

    expect(run(world)).toStrictEqual([
      { path: "a", wrote: true },
      { path: "b", ok: false, detail: "not there" },
    ]);
  });

  it("says nothing of an object that is gone", () => {
    expect(run({ ...MOVED, where: {} })).toStrictEqual([
      { path: "a", wrote: true },
      { path: "b", ok: false, detail: "refused" },
    ]);
  });

  it("says nothing when the tool didn't know what the path named", () => {
    const { b: _unknown, ...atStart } = MOVED.atStart;

    expect(run({ ...MOVED, atStart })).toStrictEqual([
      { path: "a", wrote: true },
      { path: "b", ok: false, detail: "refused" },
    ]);
  });

  it("says nothing when no target was written, so nothing moved", () => {
    expect(run({ ...MOVED, fails: ["a", "b"] })).toStrictEqual([
      { path: "a", ok: false, detail: "refused" },
      { path: "b", ok: false, detail: "refused" },
    ]);
  });

  it("leaves a skip named by id alone", () => {
    const spec = pathToy(MOVED);
    const result = runWrite(
      {
        ...spec,
        targets: () => [
          {
            named: { param: "id", value: "x" },
            atStart: "id2",
            skip: "not there",
          },
          { named: { param: "path", value: "a" }, key: "a", data: undefined },
        ],
      },
      MOVED,
    );

    expect(result).toStrictEqual([
      { id: "x", ok: false, detail: "not there" },
      { path: "a", wrote: true },
    ]);
  });
});

describe("runWrite: a lookup that fails after the writes", () => {
  it.each(["idAt", "whereIs"] as const)(
    "keeps every entry, without the clause, when %s throws, and warns of nothing",
    (lookup) => {
      const capture = beginWarningCapture();
      const result = run(MOVED, {
        [lookup]: () => {
          throw new Error("lookup failed");
        },
      });

      expect(result).toStrictEqual([
        { path: "a", wrote: true },
        { path: "b", ok: false, detail: "refused" },
      ]);
      expect(endWarningCapture(capture)).toStrictEqual([]);
    },
  );

  it("still adds the clause to the entries it can", () => {
    const world: World = {
      paths: "a,b,c",
      atStart: { a: "id1", b: "id2", c: "id3" },
      fails: ["b", "c"],
      now: { a: "id1", b: "id9", c: "id9" },
      where: { id2: { path: "x", noun: "chain" } },
    };

    const result = run(world, {
      whereIs: (id) => {
        if (id === "id3") {
          throw new Error("lookup failed");
        }

        return world.where[id];
      },
    });

    expect(result).toStrictEqual([
      { path: "a", wrote: true },
      { path: "b", ok: false, detail: "refused; that chain is now x (id id2)" },
      { path: "c", ok: false, detail: "refused" },
    ]);
  });
});

describe("whereObjectIs", () => {
  it.each<[LiveObjectType, unknown, string, string]>([
    ["Track", livePath.track(1), "t1", "track"],
    ["Scene", livePath.scene(2), "s2", "scene"],
    ["PluginDevice", livePath.track(0).device(1), "t0/d1", "device"],
    ["Chain", livePath.track(0).device(0).chain(2), "t0/d0/c2", "chain"],
    ["TakeLane", livePath.track(0).takeLane(1), "t0/l1", "take lane"],
  ])("names a %s by its path and noun", (type, path, spelled, noun) => {
    registerMockObject("50", { path: String(path), type });

    expect(whereObjectIs("50")).toStrictEqual({ path: spelled, noun });
  });

  it("calls a drum pad a pad", () => {
    registerMockObject("51", {
      path: livePath.track(0).device(0).drumPad(36),
      type: "DrumPad",
      properties: { note: 36 },
    });

    expect(whereObjectIs("51")?.noun).toBe("pad");
  });

  it("finds nothing for an object whose path has cleared", () => {
    // Live clears a destroyed object's path.
    registerMockObject("52", { returnPath: "", type: "Track" });

    expect(whereObjectIs("52")).toBeUndefined();
  });

  it("finds nothing for an id the registry has dropped", () => {
    registerMockObject("53", {
      path: String(livePath.track(3)),
      type: "Track",
    });
    deleteMockObject("53");

    expect(whereObjectIs("53")).toBeUndefined();
  });
});
