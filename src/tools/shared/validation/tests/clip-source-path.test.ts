// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { requireClipSourcePath } from "../helpers/clip-source-path.ts";
import { parseObjectPath } from "../object-path.ts";

/**
 * Narrows a path written the way a caller writes it.
 * @param path - The path text
 * @returns What the path names, as a source
 */
function sourceFor(path: string): unknown {
  return requireClipSourcePath(parseObjectPath(path));
}

describe("requireClipSourcePath", () => {
  it("takes a clip slot", () => {
    expect(sourceFor("t0/s3")).toStrictEqual({
      kind: "slot",
      trackIndex: 0,
      sceneIndex: 3,
    });
  });

  it.each([
    ["t0[5|1]", { kind: "track", trackIndex: 0 }, "5|1"],
    [
      "t2/l1[loc:Chorus]",
      { kind: "take-lane", trackIndex: 2, laneIndex: 1 },
      "loc:Chorus",
    ],
  ])("takes the complete arrangement path %s", (path, lane, position) => {
    expect(sourceFor(path)).toStrictEqual({
      kind: "arrangement-position",
      lane,
      position,
    });
  });

  // A partial path names more than one clip, so a tool addressing one refuses
  // it and shows the complete form. Both partials still work as destinations.
  it.each([
    [
      "t0",
      'invalid path "t0" - a track\'s arrangement holds many clips; name the one to act on by where it starts, as "t0[5|1]"',
    ],
    [
      "t1/l2",
      'invalid path "t1/l2" - a take lane holds many clips; name the one to act on by where it starts, as "t1/l2[5|1]"',
    ],
    [
      "[5|1]",
      'invalid path "[5|1]" - a song position with no lane names a clip on every track; name the lane too, as "t<track>[5|1]"',
    ],
    [
      "t3/l+",
      'invalid path "t3/l+" - a new take lane holds no clips; name a lane that exists, as "t3/l0[5|1]"',
    ],
    [
      "t3/l+[5|1]",
      'invalid path "t3/l+[5|1]" - a new take lane holds no clips; name a lane that exists, as "t3/l0[5|1]"',
    ],
  ])("refuses %s as a source", (path, message) => {
    expect(() => sourceFor(path)).toThrow(message);
  });

  // Something a clip can never occupy keeps the message it already gave: the
  // rejection names the caller's own concept.
  it("refuses a path no clip can occupy at all", () => {
    expect(() => sourceFor("t0/d0")).toThrow("device paths hold no clips");
  });
});
