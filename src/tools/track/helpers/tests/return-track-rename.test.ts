// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { returnTrackRename } from "#src/tools/track/helpers/return-track-rename.ts";

const PREFIXED = "Live prefixes a return track's name with its send letter";

/**
 * A return track's Live API path.
 * @param index - The return track's index
 * @returns The path
 */
function returnPath(index: number): string {
  return String(livePath.returnTrack(index));
}

describe("returnTrackRename", () => {
  it("writes nothing when the call renamed nothing", () => {
    expect(returnTrackRename(returnPath(0), undefined)).toStrictEqual({
      write: undefined,
      landed: {},
    });
  });

  it("strips the slot's own letter, so Live's prefix isn't doubled", () => {
    expect(returnTrackRename(returnPath(0), "A-Delay")).toStrictEqual({
      write: "Delay",
      landed: {},
    });
    expect(returnTrackRename(returnPath(1), "B-Reverb")).toStrictEqual({
      write: "Reverb",
      landed: {},
    });
  });

  it("strips whatever case the letter was written in", () => {
    expect(returnTrackRename(returnPath(0), "a-Delay")).toStrictEqual({
      write: "Delay",
      landed: { name: "A-Delay", reason: PREFIXED },
    });
  });

  it("keeps another slot's letter and reports the doubled name", () => {
    expect(returnTrackRename(returnPath(2), "B-Side")).toStrictEqual({
      write: "B-Side",
      landed: { name: "C-B-Side", reason: PREFIXED },
    });
  });

  it("reports the letter a bare name comes back with", () => {
    expect(returnTrackRename(returnPath(0), "Tape")).toStrictEqual({
      write: "Tape",
      landed: { name: "A-Tape", reason: PREFIXED },
    });
  });

  it("strips the last letter it knows, Z", () => {
    expect(returnTrackRename(returnPath(25), "Z-Delay")).toStrictEqual({
      write: "Delay",
      landed: {},
    });
  });

  it("claims nothing past return track Z, where Live's label is unknown", () => {
    expect(returnTrackRename(returnPath(26), "A-Delay")).toStrictEqual({
      write: "A-Delay",
      landed: {},
    });
  });

  it("leaves a regular track's name alone", () => {
    expect(
      returnTrackRename(String(livePath.track(0)), "A-Delay"),
    ).toStrictEqual({ write: "A-Delay", landed: {} });
  });
});
