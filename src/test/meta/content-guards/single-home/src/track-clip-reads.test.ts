// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// Session clips, arrangement clips and take-lane clips each mapped their own
// ids through readOneClip and filtered the empty slots out. track-clips.ts
// does that in one place now.
const CLIP_READ = /readOneClip\(/;

const HOME = "src/tools/track/read/helpers/track-clips.ts";

describe("a track's clip reads have one home", () => {
  it("calls readOneClip from track-clips.ts only", () => {
    expect(
      filesContaining("src/tools/track", CLIP_READ),
      "read a collection's clips through track-clips.ts",
    ).toStrictEqual([HOME]);
  });
});
