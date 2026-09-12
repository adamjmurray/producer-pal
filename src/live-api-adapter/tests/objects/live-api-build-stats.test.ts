// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The counter tests read the recorder through LiveAPI.from rather than calling
// record*() by hand, so they also pin the hooks in live-api-build.ts.

import { describe, expect, it, vi } from "vitest";
import * as disabled from "#src/live-api-adapter/live-api-build-stats-disabled.ts";
import * as stats from "#src/live-api-adapter/live-api-build-stats.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";

describe("live-api build stats", () => {
  it("counts every resolution, and every distinct target once", () => {
    LiveAPI.from(livePath.track(0));
    LiveAPI.from(livePath.track(0));
    LiveAPI.from(livePath.track(1));

    expect(stats.liveApiBuildStats()).toStrictEqual({
      resolved: 3,
      distinct: 2,
      constructed: 3,
      byShape: [["live_set tracks *", 3]],
    });
  });

  // Tests never open a release scope, so the pool stays cold and every
  // resolution builds — except a repeat of a memoized target (live-api-build.ts).
  it("counts a build separately from the resolution that asked for it", () => {
    LiveAPI.from(livePath.liveSet);
    LiveAPI.from(livePath.liveSet);

    expect(stats.liveApiBuildStats()).toStrictEqual({
      resolved: 2,
      constructed: 1,
      distinct: 1,
      byShape: [["live_set", 2]],
    });
  });

  it("groups targets by shape, so one line stands for every clip", () => {
    LiveAPI.from(livePath.track(0).clipSlot(3).clip());
    LiveAPI.from(livePath.track(7).clipSlot(11).clip());
    LiveAPI.from("id 42");

    expect(stats.liveApiBuildStats().byShape).toStrictEqual([
      ["live_set tracks * clip_slots * clip", 2],
      ["id *", 1],
    ]);
  });

  it("forgets everything when a new call starts counting", () => {
    LiveAPI.from(livePath.track(0));

    stats.beginLiveApiBuildStats();

    expect(stats.liveApiBuildStats()).toStrictEqual({
      resolved: 0,
      distinct: 0,
      constructed: 0,
      byShape: [],
    });
  });

  describe("report", () => {
    it("warns the totals and the shapes", () => {
      const warn = vi.spyOn(console, "warn");

      LiveAPI.from(livePath.track(0));
      LiveAPI.from(livePath.track(1));
      stats.reportLiveApiBuildStats();

      expect(warn).toHaveBeenCalledWith(
        "LiveAPI stats: 2 resolved, 2 distinct, 2 constructed | " +
          "live_set tracks *: 2",
      );
    });

    // Max carries the warning across as one symbol, so the report is one line.
    it("emits a single line", () => {
      const warn = vi.spyOn(console, "warn");

      LiveAPI.from(livePath.track(0));
      stats.reportLiveApiBuildStats();

      expect(warn.mock.calls[0]?.[0]).not.toContain("\n");
    });

    it("summarizes the shapes past the cap instead of listing them", () => {
      const warn = vi.spyOn(console, "warn");

      // One shape per depth, so the count of shapes is the count of calls.
      let path = livePath.track(0).device(0);

      for (let depth = 0; depth < 25; depth++) {
        LiveAPI.from(path);
        path = path.chain(0).device(0);
      }

      stats.reportLiveApiBuildStats();

      expect(warn.mock.calls[0]?.[0]).toContain("+5 more shapes");
    });

    it("says nothing when the call resolved nothing", () => {
      const warn = vi.spyOn(console, "warn");

      stats.reportLiveApiBuildStats();

      expect(warn).not.toHaveBeenCalled();
    });
  });

  // Nothing typechecks the stub against the real module — the substitution is a
  // bundler concern — so a divergence would only show up as a runtime failure
  // in an instrumented build.
  describe("disabled stub", () => {
    it("exports the same names as the real module", () => {
      expect(Object.keys(disabled).toSorted()).toStrictEqual(
        Object.keys(stats).toSorted(),
      );
    });

    it("counts nothing and reports nothing", () => {
      const warn = vi.spyOn(console, "warn");

      disabled.beginLiveApiBuildStats();
      disabled.recordLiveApiResolve(livePath.liveSet);
      disabled.recordLiveApiConstruct();
      disabled.reportLiveApiBuildStats();

      expect(disabled.liveApiBuildStats()).toStrictEqual({
        resolved: 0,
        distinct: 0,
        constructed: 0,
        byShape: [],
      });
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
