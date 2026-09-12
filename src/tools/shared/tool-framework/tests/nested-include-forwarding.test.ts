// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";

vi.mock(import("#src/tools/clip/read/read-clip.ts"), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, readClip: vi.fn(actual.readClip) };
});

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { readClip } from "#src/tools/clip/read/read-clip.ts";
import { readScene } from "#src/tools/scene/read-scene.ts";
import { mockTrackProperties } from "#src/tools/track/read/tests/helpers/read-track-test-helpers.ts";
import { setupTrackPathMappedMocks } from "#src/tools/track/read/tests/helpers/read-track-path-mapped-test-helpers.ts";
import { readTrack } from "#src/tools/track/read/read-track.ts";

// A tool that forwards a bare '*' to a nested read hands the expansion to the
// nested option list, which turns on options the outer tool never published.
// These pin the expansion in place: delete it and the '*' shows up here.
describe("include forwarding to nested clip reads", () => {
  it("read-track expands '*' before forwarding it", () => {
    setupTrackPathMappedMocks({
      pathIdMap: {
        [String(livePath.track(0))]: "track1",
        [livePath.track(0).clipSlot(0).clip()]: "clip1",
      },
      objects: {
        Track: mockTrackProperties({
          devices: [],
          clip_slots: children("slot1"),
          arrangement_clips: [],
        }),
        clip1: { is_midi_clip: 1 },
      },
    });

    readTrack({ trackIndex: 0, include: ["*"] });

    expect(forwardedIncludes()).not.toContain("*");
  });

  it("read-scene expands '*' before forwarding it", () => {
    registerMockObject("live_set", {
      path: livePath.liveSet,
      type: "Song",
      properties: { tracks: children("track1") },
    });
    registerMockObject("track1", {
      path: livePath.track(0),
      type: "Track",
      properties: { name: "Track 0", has_midi_input: 1 },
    });
    registerMockObject("scene1", {
      path: livePath.scene(0),
      type: "Scene",
      properties: {
        name: "Scene",
        tempo_enabled: 0,
        time_signature_enabled: 0,
      },
    });
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
      type: "Clip",
      properties: { is_midi_clip: 1 },
    });

    readScene({ sceneIndex: 0, include: ["*"] });

    expect(forwardedIncludes()).not.toContain("*");
  });
});

/**
 * Every include option handed to a nested clip read.
 * @returns The options, flattened across the readClip calls
 */
function forwardedIncludes(): string[] {
  const calls = vi.mocked(readClip).mock.calls;

  expect(calls.length).toBeGreaterThan(0);

  return calls.flatMap(([args]) => args?.include ?? []);
}
