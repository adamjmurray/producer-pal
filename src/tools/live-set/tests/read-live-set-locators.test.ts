// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  children,
  liveApiId,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";

describe("readLiveSet - locators", () => {
  it("should not include locators by default", () => {
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === "live_set") return "live_set_id";

      return this._id;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Test Set",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        scale_mode: 0,
        tracks: [],
        scenes: [],
        cue_points: children("cue1"),
      },
    });

    const result = readLiveSet({ include: [] });

    expect(result.locators).toBeUndefined();
  });

  it("should include locators when requested", () => {
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === "live_set") return "live_set_id";
      if (this._path === "id cue1") return "cue1";
      if (this._path === "id cue2") return "cue2";

      return this._id;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Test Set",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        scale_mode: 0,
        tracks: [],
        scenes: [],
        cue_points: children("cue1", "cue2"),
      },
      cue1: {
        name: "Intro",
        time: 0,
      },
      cue2: {
        name: "Verse",
        time: 16,
      },
    });

    const result = readLiveSet({ include: ["locators"] });

    expect(result.locators).toStrictEqual([
      { id: "locator-0", name: "Intro", time: "1|1" },
      { id: "locator-1", name: "Verse", time: "5|1" },
    ]);
  });

  it("should handle empty locators array", () => {
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === "live_set") return "live_set_id";

      return this._id;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Test Set",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        scale_mode: 0,
        tracks: [],
        scenes: [],
        cue_points: [],
      },
    });

    const result = readLiveSet({ include: ["locators"] });

    expect(result.locators).toStrictEqual([]);
  });

  it("should format locator times correctly in different time signatures", () => {
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === "live_set") return "live_set_id";
      if (this._path === "id cue1") return "cue1";

      return this._id;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Test Set",
        tempo: 120,
        signature_numerator: 3,
        signature_denominator: 4,
        scale_mode: 0,
        tracks: [],
        scenes: [],
        cue_points: children("cue1"),
      },
      cue1: {
        name: "Chorus",
        time: 6, // 6 quarter notes = bar 3, beat 1 in 3/4
      },
    });

    const result = readLiveSet({ include: ["locators"] });

    expect(result.locators).toStrictEqual([
      { id: "locator-0", name: "Chorus", time: "3|1" },
    ]);
  });

  it("should include locators with wildcard include", () => {
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === "live_set") return "live_set_id";
      if (this._path === "id cue1") return "cue1";

      return this._id;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Test Set",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        scale_mode: 0,
        tracks: [],
        scenes: [],
        cue_points: children("cue1"),
      },
      cue1: {
        name: "Bridge",
        time: 32,
      },
    });

    const result = readLiveSet({ include: ["*"] });

    expect(result.locators).toStrictEqual([
      { id: "locator-0", name: "Bridge", time: "9|1" },
    ]);
  });
});
