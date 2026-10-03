// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import {
  LIVE_FAILURE,
  failOnSet,
} from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";
import { updateTrack } from "../update-track.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

// One track named twice, in any spelling, is written as its last mention asks.
describe("updateTrack - a track named twice", () => {
  let track: RegisteredMockObject;

  beforeEach(() => {
    track = registerMockObject("123", { path: livePath.track(0) });
    registerMockObject("456", { path: livePath.track(1) });
  });

  it("writes only the last mention, whatever the earlier one was spelled as", () => {
    expect(
      updateTrack({ id: "123", path: "t0", name: "First,Second" }),
    ).toStrictEqual([
      { id: "123", detail: 'named again as "t0" later in this call' },
      { id: "123", path: "t0" },
    ]);
    expect(track.set).toHaveBeenCalledExactlyOnceWith("name", "Second");
  });

  it("names a repeated id the same way", () => {
    expect(updateTrack({ id: "123,123", name: "A,B" })).toStrictEqual([
      { id: "123", detail: "named again as id 123 later in this call" },
      { id: "123", path: "t0" },
    ]);
    expect(track.set).toHaveBeenCalledExactlyOnceWith("name", "B");
  });

  it("keeps each track's own place when others sit between the mentions", () => {
    expect(updateTrack({ path: "t0,t1,t0", name: "A,B,C" })).toStrictEqual([
      { path: "t0", detail: 'named again as "t0" later in this call' },
      { id: "456", path: "t1" },
      { id: "123", path: "t0" },
    ]);
  });

  it("fails the earlier mention too when the last one lands nothing", () => {
    failOnSet(track);

    expect(updateTrack({ id: "123", path: "t0", name: "A,B" })).toStrictEqual([
      {
        id: "123",
        ok: false,
        detail: 'not written: "t0" was meant to replace it, but failed',
      },
      { path: "t0", ok: false, detail: LIVE_FAILURE },
    ]);
  });
});

describe("updateTrack - a take lane named twice", () => {
  let laneId: string;
  let lane: RegisteredMockObject;

  beforeEach(() => {
    registerTakeLaneTrack({ initialLanes: 1 });
    lane = lookupMockObject(
      undefined,
      livePath.track(0).takeLane(0),
    ) as RegisteredMockObject;
    laneId = lane.id;
  });

  it("names the lane once, as the last mention asks", () => {
    expect(
      updateTrack({ id: laneId, path: "t0/l0", name: "First,Second" }),
    ).toStrictEqual([
      { id: laneId, detail: 'named again as "t0/l0" later in this call' },
      { id: laneId, path: "t0/l0" },
    ]);
    expect(lane.set).toHaveBeenCalledExactlyOnceWith("name", "Second");
  });

  it("leaves two appends as two lanes", () => {
    const result = updateTrack({ path: "t0/l+,t0/l+", name: "A,B" });

    expect(result).toHaveLength(2);
    expect(result).not.toContainEqual(
      expect.objectContaining({ detail: expect.stringMatching(/named again/) }),
    );
  });
});
