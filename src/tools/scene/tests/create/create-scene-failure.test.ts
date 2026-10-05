// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import {
  type RegisteredMockObject,
  lookupMockObject,
  mockNonExistentObjects,
} from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_FAILURE,
  failCall,
  failOnCreated,
  hookCalls,
  registerScenes,
} from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";
import { createScene } from "../../create-scene.ts";

const OUT_OF_TIME = "the request ran out of time; re-run for this path";

/**
 * A Live Set with two scenes.
 * @returns The Live Set
 */
function setUpScenes(): RegisteredMockObject {
  registerScenes(2);

  return lookupMockObject("live_set") as RegisteredMockObject;
}

/**
 * The indexes the Live Set was asked to create scenes at, in order.
 * @param liveSet - The Live Set
 * @returns One index per create call, the padding as -1
 */
function createdAt(liveSet: RegisteredMockObject): unknown[] {
  return liveSet.call.mock.calls
    .filter(([name]) => name === "create_scene")
    .map(([, index]) => index);
}

/**
 * Make Live keep a different time signature than the one it was given.
 * @param liveSet - The Live Set
 * @param kept - The numerator and denominator the new scene ends up with
 */
function keepTimeSignature(
  liveSet: RegisteredMockObject,
  kept: [number, number],
): void {
  hookCalls(liveSet, /^create_scene$/, {
    after: (_nth, _args, result) => {
      const made = lookupMockObject(String((result as string[])[1]));

      Object.assign((made as RegisteredMockObject).properties, {
        time_signature_numerator: kept[0],
        time_signature_denominator: kept[1],
      });
    },
  });
}

describe("createScene when Live fails partway", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gives the failing insert its own entry and plans the rest from what is there", () => {
    const liveSet = setUpScenes();

    failCall(liveSet, /^create_scene$/, 2);

    expect(createScene({ path: "s2,s2,s2" })).toStrictEqual([
      { id: expect.any(String), path: "s2" },
      { path: "s2", ok: false, detail: LIVE_FAILURE },
      { id: expect.any(String), path: "s3" },
    ]);
    // The third was planned to land after two others; only one did.
    expect(createdAt(liveSet)).toStrictEqual([2, 3, 3]);
  });

  it("names the scene made first where it sits when the one past it failed", () => {
    // The second would have filled s5, so the first padded one scene short of s6.
    const liveSet = setUpScenes();

    failCall(liveSet, /^create_scene$/, 5);

    expect(createScene({ path: "s6,s5" })).toStrictEqual([
      { id: expect.any(String), path: "s5", created: "s2-s4" },
      { path: "s5", ok: false, detail: LIVE_FAILURE },
    ]);
  });

  it("names the empty scenes made for a scene Live then would not insert", () => {
    const liveSet = setUpScenes();

    // Three pads land (calls 1 to 3), then the insert itself is refused.
    failCall(liveSet, /^create_scene$/, 4);

    expect(createScene({ path: "s5,s+" })).toStrictEqual([
      {
        path: "s5",
        ok: false,
        detail: `${LIVE_FAILURE}; created s2-s4 to reach it`,
      },
      { id: expect.any(String), path: "s5" },
    ]);
  });

  it("names the empty scenes a refused pad left behind", () => {
    const liveSet = setUpScenes();

    failCall(liveSet, /^create_scene$/, 3);

    expect(() => createScene({ path: "s5" })).toThrow(
      `${LIVE_FAILURE}; created s2-s3 to reach it`,
    );
    expect(createdAt(liveSet)).toStrictEqual([-1, -1, -1]);
  });

  it("says only why when the first empty scene is refused", () => {
    failCall(setUpScenes(), /^create_scene$/, 1);

    expect(() => createScene({ path: "s5" })).toThrow(
      new RegExp(`^${LIVE_FAILURE}$`),
    );
  });

  it("keeps a scene's entry when it was made and then would not take its name", () => {
    const liveSet = setUpScenes();

    failOnCreated(liveSet, /^create_scene$/, 2);

    expect(createScene({ path: "s2,s2,s2", name: "A,B,C" })).toStrictEqual([
      { id: expect.any(String), path: "s2" },
      {
        id: expect.any(String),
        path: "s3",
        detail: `${LIVE_FAILURE}; already changed: scene created`,
      },
      { id: expect.any(String), path: "s4" },
    ]);
    expect(createdAt(liveSet)).toStrictEqual([2, 3, 4]);
  });

  it("throws when the one scene's insert fails", () => {
    failCall(setUpScenes(), /^create_scene$/, 1);

    expect(() => createScene({ path: "s+" })).toThrow(LIVE_FAILURE);
  });

  it("skips a scene Live did not make", () => {
    setUpScenes().call.mockImplementationOnce(() => null);
    mockNonExistentObjects();

    expect(createScene({ path: "s+,s+" })).toStrictEqual([
      { path: "s+", ok: false, detail: "Live did not create the scene" },
      { id: expect.any(String), path: "s2" },
    ]);
  });

  it("throws when the one scene Live was asked for is not made", () => {
    setUpScenes().call.mockImplementationOnce(() => null);
    mockNonExistentObjects();

    expect(() => createScene({ path: "s+" })).toThrow(
      "Live did not create the scene",
    );
  });

  it("leaves an existing scene alone when Live ignores the create at its index", () => {
    setUpScenes().call.mockImplementationOnce(() => null);

    expect(createScene({ path: "s0,s1", name: "A,B" })).toStrictEqual([
      { path: "s0", ok: false, detail: "Live did not create the scene" },
      { id: expect.any(String), path: "s1" },
    ]);
    expect(
      (lookupMockObject("s0") as RegisteredMockObject).set,
    ).not.toHaveBeenCalled();
  });

  it("names the empty scenes a failed insert left where they sit after a later insert", () => {
    // The failed s4 padded s2 (s0 would have filled the other gap); s0 then moves it to s3.
    failCall(setUpScenes(), /^create_scene$/, 2);

    expect(createScene({ path: "s4,s0" })).toStrictEqual([
      {
        path: "s4",
        ok: false,
        detail: `${LIVE_FAILURE}; created s3 to reach it`,
      },
      { id: expect.any(String), path: "s0" },
    ]);
  });

  it("reports the empty scenes a landed entry padded when the deadline stops the call", () => {
    const start = 1_000_000;
    let now = start;

    vi.spyOn(Date, "now").mockImplementation(() => now);

    const liveSet = setUpScenes();

    hookCalls(liveSet, /^create_scene$/, {
      after: (_nth, [index]) => {
        // The first scene made for itself, not for padding, uses up the time.
        if (index !== -1) {
          now = start + 5000;
        }
      },
    });

    const [first, ...rest] = createScene(
      { path: "s7,s4,s5,s4" },
      { deadline: start + 1000 },
    ) as Array<{ path: string; created?: string; detail?: string }>;

    // Later scenes would have taken some of the padding, so s7 padded fewer than
    // it needed and all of it sits below it.
    expect(first).toStrictEqual({
      id: expect.any(String),
      path: expect.stringMatching(/^s\d$/),
      created: expect.stringMatching(/^s2-s\d$/),
    });
    expect(rest.map((entry) => entry.detail)).toStrictEqual([
      OUT_OF_TIME,
      OUT_OF_TIME,
      OUT_OF_TIME,
    ]);
  });

  it("leaves the scenes the deadline never reached as skips", () => {
    const start = 1_000_000;
    let now = start;

    vi.spyOn(Date, "now").mockImplementation(() => now);

    const liveSet = setUpScenes();

    hookCalls(liveSet, /^create_scene$/, {
      after: () => {
        // The first create uses up the time.
        now = start + 5000;
      },
    });

    expect(
      createScene({ path: "s0,s+,s+" }, { deadline: start + 1000 }),
    ).toStrictEqual([
      { id: expect.any(String), path: "s0" },
      { path: "s+", ok: false, detail: OUT_OF_TIME },
      { path: "s+", ok: false, detail: OUT_OF_TIME },
    ]);
    expect(createdAt(liveSet)).toStrictEqual([0]);
  });
});

describe("createScene time signature", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a denominator Live can't keep before anything is made", () => {
    const liveSet = setUpScenes();

    expect(() => createScene({ path: "s+", timeSignature: "4/3" })).toThrow(
      'timeSignature "4/3" has a denominator Live can\'t keep',
    );
    expect(() =>
      createScene({ path: "s+,s+", timeSignature: "4/4,7/6" }),
    ).toThrow('timeSignature "7/6"');
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("reports the time signature Live kept in place of the one asked for", () => {
    keepTimeSignature(setUpScenes(), [7, 4]);

    expect(createScene({ path: "s+", timeSignature: "7/8" })).toStrictEqual({
      id: expect.any(String),
      path: "s2",
      timeSignature: "7/4",
      detail: "timeSignature read back as shown, not as sent",
    });
  });

  it("says nothing when Live kept the time signature", () => {
    keepTimeSignature(setUpScenes(), [7, 8]);

    expect(createScene({ path: "s+", timeSignature: "7/8" })).toStrictEqual({
      id: expect.any(String),
      path: "s2",
    });
  });

  it("claims nothing about a time signature it could not read back", () => {
    setUpScenes();

    expect(createScene({ path: "s+", timeSignature: "7/8" })).toStrictEqual({
      id: expect.any(String),
      path: "s2",
    });
  });

  it("does not read back a disabled time signature", () => {
    setUpScenes();

    expect(
      createScene({ path: "s+", timeSignature: "disabled" }),
    ).toStrictEqual({ id: expect.any(String), path: "s2" });
  });
});
