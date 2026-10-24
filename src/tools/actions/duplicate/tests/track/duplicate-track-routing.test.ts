// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Routing a track copy to its source: a source that isn't there is left out,
// and a routing that fails keeps the copy.

import { describe, expect, it } from "vitest";
import "../duplicate-mocks-test-helpers.ts";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  createTrackResult,
  setupRoutingMocks,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";

describe("duplicate - routeToSource when a copy or its routing fails", () => {
  it("leaves a source that isn't there out of the routing", async () => {
    mockNonExistentObjects();

    const { newTrack } = setupRoutingMocks({
      monitoringState: 1,
      inputRoutingName: "Audio In",
    });

    const result = await duplicate({
      type: "track",
      id: "nowhere,track1",
      routeToSource: true,
    });

    expect(result).toStrictEqual([
      { id: "nowhere", ok: false, detail: 'id "nowhere" does not exist' },
      {
        ...createTrackResult(1),
        detail:
          'source track t0 (id live_set/tracks/0): set its input to "No Input"',
      },
    ]);
    expect(newTrack.set).toHaveBeenCalledWith(
      "output_routing_type",
      expect.anything(),
    );
  });

  it("keeps the copy when routing it fails, and says so", async () => {
    const { newTrack } = setupRoutingMocks({
      monitoringState: 1,
      inputRoutingName: "Audio In",
    });

    newTrack.set.mockImplementation((prop: string) => {
      if (prop === "output_routing_type") {
        throw new Error("Live is unhappy");
      }
    });

    const result = (await duplicate({
      type: "track",
      id: "track1",
      routeToSource: true,
    })) as { id: string; detail?: string };

    expect(result.id).toBe(createTrackResult(1).id);
    expect(result.detail).toContain(
      "the track was made, but routing didn't finish: Live is unhappy",
    );
  });
});
