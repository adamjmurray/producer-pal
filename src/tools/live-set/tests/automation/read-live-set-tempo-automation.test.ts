// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";
import {
  masterTrackMockObject,
  setupLiveSetPathMappedMocks,
} from "../read-live-set-path-mapped-test-helpers.ts";

const SONG_TEMPO = `${livePath.masterTrack().mixerDevice()} song_tempo`;

/**
 * A Live Set with only a main track, whose tempo parameter may be missing.
 * @param tempoProperties - The tempo parameter's properties; omit for none
 */
function setupTempo(tempoProperties?: Record<string, unknown>): void {
  setupLiveSetPathMappedMocks({
    pathIdMap: { [String(livePath.masterTrack())]: "master1" },
    objects: {
      LiveSet: {
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        tracks: [],
        return_tracks: children(),
        scenes: [],
      },
      ...masterTrackMockObject(),
      ...(tempoProperties == null ? {} : { [SONG_TEMPO]: tempoProperties }),
    },
  });
}

describe("readLiveSet - tempo automation", () => {
  it.each([
    ["an active lane", 1, ["tempo"]],
    ["an overridden lane", 2, ["tempo (overridden)"]],
  ])("names the tempo for %s", (_label, state, expected) => {
    setupTempo({ automation_state: state });

    const result = readLiveSet({ include: [] });

    expect(result.automation).toStrictEqual(expected);
    expect(result.tempo).toBe(120);
  });

  it("omits automation when the tempo has no lane", () => {
    setupTempo({ automation_state: 0 });

    expect(readLiveSet({ include: [] })).not.toHaveProperty("automation");
  });

  it("omits automation when the main track has no tempo parameter", () => {
    setupTempo();

    expect(readLiveSet({ include: [] })).not.toHaveProperty("automation");
  });
});
