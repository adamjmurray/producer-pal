// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { stripReturnTrackLetter } from "#src/tools/track/helpers/track-name-helpers.ts";

/**
 * A return track's Live API path.
 * @param index - 0-based return track index
 * @returns The path as a string
 */
function returnPath(index: number): string {
  return String(livePath.returnTrack(index));
}

describe("stripReturnTrackLetter", () => {
  it("strips the track's own letter so a round-tripped name doesn't double", () => {
    expect(stripReturnTrackLetter(returnPath(0), "A-Delay")).toBe("Delay");
    expect(stripReturnTrackLetter(returnPath(1), "B-Reverb")).toBe("Reverb");
  });

  it("keeps a letter that isn't this track's", () => {
    expect(stripReturnTrackLetter(returnPath(1), "A-Delay")).toBe("A-Delay");
  });

  it("leaves a regular track's name alone", () => {
    expect(stripReturnTrackLetter(String(livePath.track(0)), "A-Delay")).toBe(
      "A-Delay",
    );
  });

  it("leaves the name alone past return track Z", () => {
    // Live's label for the 27th return track is unknown, so guessing a prefix
    // to strip would corrupt a name the user typed on purpose.
    expect(stripReturnTrackLetter(returnPath(26), "A-Delay")).toBe("A-Delay");
  });

  it("strips the letter for the last track it can name (Z)", () => {
    expect(stripReturnTrackLetter(returnPath(25), "Z-Delay")).toBe("Delay");
  });
});
