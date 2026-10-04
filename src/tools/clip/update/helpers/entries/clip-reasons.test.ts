// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import {
  clipIgnoredParams,
  clipLandedNothing,
  clipReporterFor,
  ignoreClipParams,
  moveClipReasons,
  newClipReasons,
  noteClipColor,
  noteClipReadBack,
  noteTakeLanesMade,
  reportClipReasons,
} from "./clip-reasons.ts";

describe("clip-reasons", () => {
  it("hands an ignored param over with the rest of a clip's reasons", () => {
    const reasons = newClipReasons();

    ignoreClipParams(
      reasons,
      "new_id",
      ["notes"],
      "notes ignored: it is audio",
    );
    moveClipReasons(reasons, "new_id", "named_id");

    // The caller knows the clip by the id it named, so the param it ignored has
    // to travel with the reason — the loop reads both under that id.
    expect([...clipIgnoredParams(reasons, "named_id")]).toStrictEqual([
      "notes",
    ]);
    expect(clipIgnoredParams(reasons, "new_id").size).toBe(0);
    expect(reasons.said.get("named_id")).toStrictEqual([
      "notes ignored: it is audio",
    ]);
  });

  it("hands a landed color over to the id the call knows the clip by", () => {
    const reasons = newClipReasons();

    noteClipColor(reasons, "new_id", {
      color: "#FF3636",
      detail: "color #FF0000 is not in Live's palette; landed as #FF3636",
    });
    moveClipReasons(reasons, "new_id", "named_id");

    const entry: ClipResult = { id: "named_id" };

    reportClipReasons(reasons, "named_id", entry);

    expect(entry).toStrictEqual({
      id: "named_id",
      color: "#FF3636",
      detail: "color #FF0000 is not in Live's palette; landed as #FF3636",
    });
    expect(reasons.colors.has("new_id")).toBe(false);
  });

  it("hands made lanes and read-backs over to the id the call knows", () => {
    const reasons = newClipReasons();

    noteTakeLanesMade(reasons, "new_id", "l1-l2", 3);
    noteClipReadBack(reasons, "new_id", { length: "1bar" });
    moveClipReasons(reasons, "new_id", "named_id");

    // No path: the move didn't say where the clip is, so the lanes are named.
    const entry: ClipResult = { id: "named_id" };

    reportClipReasons(reasons, "named_id", entry);

    expect(entry).toStrictEqual({
      id: "named_id",
      length: "1bar",
      created: "l1-l2",
      detail:
        "take lanes l1-l2 made on t3; length read back as shown, not as sent",
    });
    expect(reasons.created.has("new_id")).toBe(false);
    expect(reasons.readBacks.has("new_id")).toBe(false);
  });

  it("names a made lane only when the entry's path doesn't already", () => {
    const reasons = newClipReasons();

    noteTakeLanesMade(reasons, "1", "l2", 3);

    const onLane: ClipResult = { id: "1", path: "t3/l2[1|1]" };

    reportClipReasons(reasons, "1", onLane);

    expect(onLane).toStrictEqual({
      id: "1",
      path: "t3/l2[1|1]",
      created: "l2",
    });

    const elsewhere: ClipResult = { id: "1", path: "t0[1|1]" };

    reportClipReasons(reasons, "1", elsewhere);

    expect(elsewhere.detail).toBe("take lane l2 made on t3");
  });

  it("puts a color it could not read back on the entry as a reason only", () => {
    const reasons = newClipReasons();

    noteClipColor(reasons, "1", { detail: "could not be read back" });

    const entry: ClipResult = { id: "1" };

    reportClipReasons(reasons, "1", entry);

    expect(entry).toStrictEqual({ id: "1", detail: "could not be read back" });
  });

  it("collects what the shared arrangement steps report", () => {
    const reasons = newClipReasons();
    const reporter = clipReporterFor(reasons);

    reporter.note("1", "placed 2 of 8 tiles");
    reporter.refuse("2", "arrangementSplit ignored");

    const tiled: ClipResult = { id: "1" };

    reportClipReasons(reasons, "1", tiled);

    expect(tiled).toStrictEqual({ id: "1", detail: "placed 2 of 8 tiles" });
    // A note leaves the clip a real entry; a refusal with nothing else landing
    // makes it a skip.
    expect(clipLandedNothing(reasons, "1")).toBe(false);
    expect(clipLandedNothing(reasons, "2")).toBe(true);
  });

  it("collects every param a clip ignored", () => {
    const reasons = newClipReasons();

    ignoreClipParams(reasons, "1", ["quantize"], "quantize ignored");
    ignoreClipParams(reasons, "1", ["firstStart"], "firstStart ignored");

    expect([...clipIgnoredParams(reasons, "1")]).toStrictEqual([
      "quantize",
      "firstStart",
    ]);
  });
});
