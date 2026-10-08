// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { settleDestination } from "#src/tools/actions/duplicate/helpers/call/settle/settle-destination.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  ARRANGEMENT_SPLIT_MODE,
  LEGACY_SPLIT_MODE,
} from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import { readSplitPoints } from "#src/tools/shared/arrangement/arrangement-splitting-params.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { resolveLocatorPositions } from "#src/tools/shared/locator/song-position.ts";
import { pathNamesSomething } from "#src/tools/shared/validation/helpers/object-paths.ts";

/**
 * Every place a caller's comma list is read, each given two entries it takes.
 * A tool that cuts a list its own way belongs here, or it can drift from the
 * hole rule.
 */
const SITES: Array<[string, string, string, (list: string) => unknown]> = [
  ["targetEntries", "t0", "t1", (list) => targetEntries(list, "id")],
  [
    "split points (arrangementSplit)",
    "2|1",
    "3|1",
    (list) => readSplitPoints(list, ARRANGEMENT_SPLIT_MODE),
  ],
  [
    "split points (split)",
    "2|1",
    "3|1",
    (list) => readSplitPoints(list, LEGACY_SPLIT_MODE),
  ],
  [
    "locator positions",
    "5|1",
    "loc:Drop",
    (list) =>
      resolveLocatorPositions(LiveAPI.from(livePath.liveSet), list, {
        paramName: "arrangementStart",
      }),
  ],
  [
    "the deprecated locator param",
    "Verse",
    "Drop",
    (list) => settleDestination("clip", undefined, undefined, list),
  ],
];

/** A Set with locators "Verse" at 1|1, "Verse, part 2" at 5|1, "Drop" at 9|1. */
function setupLocators(): void {
  registerMockObject("live_set", {
    path: livePath.liveSet,
    type: "Song",
    properties: {
      signature_numerator: 4,
      signature_denominator: 4,
      cue_points: children("cue1", "cue2", "cue3"),
    },
  });
  registerMockObject("cue1", {
    type: "CuePoint",
    properties: { name: "Verse, part 2", time: 16 },
  });
  registerMockObject("cue2", {
    type: "CuePoint",
    properties: { name: "Drop", time: 32 },
  });
  registerMockObject("cue3", {
    type: "CuePoint",
    properties: { name: "Verse", time: 0 },
  });
}

beforeEach(setupLocators);

describe.each(SITES)("%s", (_site, a, b, read) => {
  it("refuses a hole", () => {
    expect(() => read(`${a},,${b}`)).toThrow("it has an empty entry");
    expect(() => read(`,${a}`)).toThrow("it has an empty entry");
  });

  it("refuses a list with nothing in it", () => {
    expect(() => read(",")).toThrow("it names nothing");
    expect(() => read(" , ,")).toThrow("it names nothing");
  });

  it("takes one trailing comma", () => {
    expect(() => read(`${a},${b},`)).not.toThrow();
  });

  it("refuses two trailing commas", () => {
    expect(() => read(`${a},${b},,`)).toThrow("it has an empty entry");
  });
});

describe("a locator name with \\,", () => {
  it("resolves in a position list", () => {
    const resolve = (list: string): string =>
      resolveLocatorPositions(LiveAPI.from(livePath.liveSet), list, {
        paramName: "arrangementStart",
      });

    expect(resolve("loc:Verse\\, part 2")).toBe("5|1");
    expect(resolve("loc:Verse\\, part 2, loc:Drop")).toBe("5|1,9|1");
  });

  it("resolves in the deprecated locator param", () => {
    const settle = (locator: string): string | undefined =>
      settleDestination("clip", undefined, undefined, locator).arrangementStart;

    expect(settle("Verse\\, part 2")).toBe("5|1");
    expect(settle("Verse\\, part 2, Drop")).toBe("5|1,9|1");
  });

  it("splits at a comma that is not escaped", () => {
    expect(
      resolveLocatorPositions(
        LiveAPI.from(livePath.liveSet),
        "loc:Verse, part 2",
        { paramName: "arrangementStart" },
      ),
    ).toBe("1|1, part 2");
  });

  it("keeps a bar|beat entry's commas escaped for the next reader", () => {
    expect(
      resolveLocatorPositions(
        LiveAPI.from(livePath.liveSet),
        "5|1\\,2|1, loc:Drop",
        { paramName: "arrangementStart" },
      ),
    ).toBe("5|1\\,2|1,9|1");
  });
});

describe("pathNamesSomething", () => {
  it("reads a list with an entry as naming something, holes and all", () => {
    expect(pathNamesSomething("t0/s0,,t1/s0")).toBe(true);
    expect(pathNamesSomething("t0[loc:A, B]")).toBe(true);
  });

  it("reads a list of empty entries as naming nothing", () => {
    expect(pathNamesSomething(" , ,")).toBe(false);
  });
});
