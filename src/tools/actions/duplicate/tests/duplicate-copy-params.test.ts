// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// count and the exclusion flags pair across the sources: one value covers them
// all, a list gives one per source in order.

import { describe, expect, it } from "vitest";
import { type ZodType } from "zod";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "./duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { toolDefDuplicate } from "#src/tools/actions/duplicate/duplicate.def.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** One track param's schema, as the tool publishes it. */
function schemaFor(param: string): ZodType {
  return toolDefDuplicate.toolOptions.inputSchema[param] as ZodType;
}

/**
 * A track to copy, with somewhere for each of its copies to land.
 * @param id - Id for the source track
 * @param trackIndex - Where the source sits
 * @param copies - How many copies the call will make of it
 * @param devices - Device ids each copy arrives with
 * @returns The new tracks, in the order they are created
 */
function registerTrackSource(
  id: string,
  trackIndex: number,
  copies: number,
  devices: unknown[] = [],
): RegisteredMockObject[] {
  registerMockObject(id, { path: livePath.track(trackIndex) });

  return Array.from({ length: copies }, (_unused, i) =>
    registerMockObject(`live_set/tracks/${trackIndex + i + 1}`, {
      path: livePath.track(trackIndex + i + 1),
      properties: { devices, clip_slots: [], arrangement_clips: [] },
    }),
  );
}

describe("duplicate copy-param schemas", () => {
  // The MCP layer coerces before the handler sees it, so a model that sends a
  // bare number or boolean still reaches the handler as one entry.
  it("coerces a single typed value to a one-entry list", () => {
    expect(schemaFor("count").parse(2)).toBe("2");
    expect(schemaFor("withoutClips").parse(true)).toBe("true");
    expect(schemaFor("routeToSource").parse(false)).toBe("false");
  });

  it("takes a list and refuses a blank or a bad entry", () => {
    expect(schemaFor("count").parse("1,2")).toBe("1,2");
    expect(schemaFor("withoutClips").parse("true,false")).toBe("true,false");

    expect(schemaFor("count").safeParse("").success).toBe(false);
    expect(schemaFor("count").safeParse("1,0").success).toBe(false);
    expect(schemaFor("count").safeParse("1,1.5").success).toBe(false);
    expect(schemaFor("withoutClips").safeParse("").success).toBe(false);
    expect(schemaFor("withoutClips").safeParse("true,yes").success).toBe(false);
  });

  it("defaults count to one copy per source", () => {
    expect(schemaFor("count").parse(undefined)).toBe("1");
  });
});

describe("duplicate - count per source", () => {
  it("makes each source its own number of copies", async () => {
    const liveSet = registerMockObject("live_set", { path: livePath.liveSet });

    registerTrackSource("trackA", 0, 1);
    registerTrackSource("trackB", 3, 2);

    const result = await duplicate({
      type: "track",
      id: "trackA,trackB",
      count: "1,2",
    });

    expect(result).toHaveLength(3);
    expect(liveSet.call.mock.calls).toStrictEqual([
      ["duplicate_track", 0],
      ["duplicate_track", 3],
      ["duplicate_track", 4],
    ]);
  });

  // The names run across every copy the call makes, so the pool has to know
  // that two sources asked for three copies between them.
  it("hands one name to each of the copies the counts add up to", async () => {
    registerMockObject("live_set", { path: livePath.liveSet });

    const [copyA] = registerTrackSource("trackA", 0, 1);
    const [copyB1, copyB2] = registerTrackSource("trackB", 3, 2);

    await duplicate({
      type: "track",
      id: "trackA,trackB",
      count: "1,2",
      name: "One,Two,Three",
    });

    expect(copyA?.set).toHaveBeenCalledWith("name", "One");
    expect(copyB1?.set).toHaveBeenCalledWith("name", "Two");
    expect(copyB2?.set).toHaveBeenCalledWith("name", "Three");
  });

  it("refuses a count list that names a different number of sources", async () => {
    registerMockObject("live_set", { path: livePath.liveSet });
    registerTrackSource("trackA", 0, 1);
    registerTrackSource("trackB", 3, 1);

    await expect(
      duplicate({ type: "track", id: "trackA,trackB", count: "1,2,3" }),
    ).rejects.toThrow("count names 3 entries but id names 2 entries");
  });

  // With one source a comma can't be a separator, and no count holds one.
  it("refuses a count list for one source", async () => {
    registerMockObject("live_set", { path: livePath.liveSet });
    registerTrackSource("trackA", 0, 1);

    await expect(
      duplicate({ type: "track", id: "trackA", count: "1,2" }),
    ).rejects.toThrow("count names 2 entries but id names one source");
  });

  it("refuses an entry below one before anything is copied", async () => {
    const liveSet = registerMockObject("live_set", { path: livePath.liveSet });

    registerTrackSource("trackA", 0, 1);
    registerTrackSource("trackB", 3, 1);

    await expect(
      duplicate({ type: "track", id: "trackA,trackB", count: "1,0" }),
    ).rejects.toThrow("count must be at least 1");
    expect(liveSet.call).not.toHaveBeenCalled();
  });
});

describe("duplicate - exclusion flags per source", () => {
  it("pairs withoutDevices one value per source", async () => {
    registerMockObject("live_set", { path: livePath.liveSet });

    const [copyA] = registerTrackSource("trackA", 0, 1, children("a0"));
    const [copyB] = registerTrackSource("trackB", 3, 1, children("b0"));

    await duplicate({
      type: "track",
      id: "trackA,trackB",
      withoutDevices: "false,true",
    });

    expect(copyA?.call).not.toHaveBeenCalledWith("delete_device", 0);
    expect(copyB?.call).toHaveBeenCalledWith("delete_device", 0);
  });

  it("refuses a flag list that names a different number of sources", async () => {
    registerMockObject("live_set", { path: livePath.liveSet });
    registerTrackSource("trackA", 0, 1);
    registerTrackSource("trackB", 3, 1);

    await expect(
      duplicate({
        type: "track",
        id: "trackA,trackB",
        withoutDevices: "true,false,true",
      }),
    ).rejects.toThrow("withoutDevices names 3 entries but id names 2 entries");
  });
});
