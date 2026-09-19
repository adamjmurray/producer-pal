// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  clipIgnoredParams,
  ignoreClipParams,
  moveClipReasons,
  newClipReasons,
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
