// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import {
  clipIgnoredParams,
  ignoreClipParams,
  moveClipReasons,
  newClipReasons,
  noteClipColor,
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
      reason: "color #FF0000 is not in Live's palette; landed as #FF3636",
    });
    moveClipReasons(reasons, "new_id", "named_id");

    const entry: ClipResult = { id: "named_id" };

    reportClipReasons(reasons, "named_id", [entry]);

    expect(entry).toStrictEqual({
      id: "named_id",
      color: "#FF3636",
      reason: "color #FF0000 is not in Live's palette; landed as #FF3636",
    });
    expect(reasons.colors.has("new_id")).toBe(false);
  });

  it("puts a color it could not read back on the entry as a reason only", () => {
    const reasons = newClipReasons();

    noteClipColor(reasons, "1", { reason: "could not be read back" });

    const entry: ClipResult = { id: "1" };

    reportClipReasons(reasons, "1", [entry]);

    expect(entry).toStrictEqual({ id: "1", reason: "could not be read back" });
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
