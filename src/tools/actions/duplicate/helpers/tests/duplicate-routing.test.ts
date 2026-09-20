// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { newTargetNotes } from "#src/tools/shared/helpers/target-notes.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  configureRouting,
  findRoutingOptionForDuplicateNames,
  type RoutingType,
} from "../duplicate-routing.ts";

/**
 * Build a routing option named "Bass" with a position-tagged identifier so a
 * test can tell which of several same-named options was returned.
 * @param i - Position tag
 * @returns Routing option
 */
function bassOption(i: number): RoutingType {
  return { display_name: "Bass", identifier: `b${i}` };
}

/**
 * Register a live_set whose `tracks` children resolve to the given
 * (id, name) pairs, in the given order.
 * @param spec - Track id/name pairs, in children (creation-input) order
 */
function setupTracks(spec: Array<{ id: string; name: string }>): void {
  registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { tracks: children(...spec.map((t) => t.id)) },
  });

  for (const t of spec) {
    registerMockObject(t.id, {
      path: livePath.track(0),
      type: "Track",
      properties: { name: t.name },
    });
  }
}

// The unresolved arm is covered below; this is the other one, where duplicate
// names still resolve and the new track actually gets routed.
describe("configureRouting with duplicate track names", () => {
  it("routes the new track to the option at the source's creation position", () => {
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: children("2", "5") },
    });
    registerMockObject("2", {
      path: livePath.track(0),
      type: "Track",
      properties: { name: "Bass", arm: 1 },
    });
    registerMockObject("5", {
      path: livePath.track(1),
      type: "Track",
      properties: { name: "Bass", arm: 1 },
    });

    const newTrack = registerMockObject("9", {
      path: livePath.track(2),
      type: "Track",
      properties: {
        available_output_routing_types: [
          JSON.stringify({
            available_output_routing_types: [bassOption(0), bassOption(1)],
          }),
        ],
      },
    });

    configureRouting(LiveAPI.from(livePath.track(2)), 1, newTargetNotes());

    // Source id 5 sorts second among the two "Bass" tracks, so it takes the
    // second option rather than falling back to the warn-and-skip arm.
    expect(newTrack.set).toHaveBeenCalledWith(
      "output_routing_type",
      JSON.stringify({ output_routing_type: { identifier: "b1" } }),
    );
  });
});

describe("findRoutingOptionForDuplicateNames", () => {
  it("returns the single matching option directly when names are not duplicated", () => {
    const sourceTrack = registerMockObject("5", {
      path: livePath.track(0),
      type: "Track",
    });

    const result = findRoutingOptionForDuplicateNames(
      sourceTrack as unknown as LiveAPI,
      "Bass",
      [bassOption(0), { display_name: "Lead", identifier: "l0" }],
    );

    expect(result).toStrictEqual(bassOption(0));
  });

  it("maps the source track to the option at its id-sorted (creation-order) position", () => {
    // Discriminating data: children order (5,2,9) differs from the id-sorted
    // order (2,5,9), and a non-matching LOW-id track ("1"=Other) is present so
    // the name filter genuinely narrows the list. Source id 5 lands at sorted
    // position 1 → options[1]. A blanked/reversed sort, a `+` comparator, or a
    // filter that keeps "Other" would all pick a different position.
    setupTracks([
      { id: "5", name: "Bass" },
      { id: "2", name: "Bass" },
      { id: "9", name: "Bass" },
      { id: "1", name: "Other" },
    ]);

    const result = findRoutingOptionForDuplicateNames(
      LiveAPI.from("id 5"),
      "Bass",
      [bassOption(0), bassOption(1), bassOption(2)],
    );

    expect(result).toStrictEqual(bassOption(1));
  });

  it("returns undefined when the source track is not among the duplicates", () => {
    setupTracks([
      { id: "5", name: "Bass" },
      { id: "2", name: "Bass" },
    ]);

    const result = findRoutingOptionForDuplicateNames(
      LiveAPI.from("id 99"),
      "Bass",
      [bassOption(0), bassOption(1)],
    );

    expect(result).toBeUndefined();
  });
  it("returns single match when no duplicates exist", () => {
    const result = findRouting("1", "Track 1", [
      { display_name: "Track 1", identifier: "track1" },
      { display_name: "Track 2", identifier: "track2" },
    ]);

    expect(result).toStrictEqual({
      display_name: "Track 1",
      identifier: "track1",
    });
  });

  it("returns undefined when no matches found", () => {
    const result = findRouting("1", "Track 1", [
      { display_name: "Track 2", identifier: "track2" },
    ]);

    expect(result).toBeUndefined();
  });

  it("finds correct option when multiple tracks have same name", () => {
    // Mock LiveAPI for global access
    (global as Record<string, unknown>).LiveAPI = createMockLiveAPI(
      ["id1", "id2", "id3"],
      { id1: "Drums", id2: "Drums", id3: "Bass" },
    );

    const result = findRouting("id1", "Drums", [
      { display_name: "Drums", identifier: "drums1" },
      { display_name: "Drums", identifier: "drums2" },
      { display_name: "Bass", identifier: "bass" },
    ]);

    // Should return the first "Drums" option since sourceTrack is id1 (first Drums track)
    expect(result).toStrictEqual({
      display_name: "Drums",
      identifier: "drums1",
    });
  });

  it("finds correct option for second track with duplicate name", () => {
    (global as Record<string, unknown>).LiveAPI = createMockLiveAPI(
      ["id1", "id2", "id3"],
      { id1: "Drums", id2: "Drums", id3: "Bass" },
    );

    const result = findRouting("id2", "Drums", [
      { display_name: "Drums", identifier: "drums1" },
      { display_name: "Drums", identifier: "drums2" },
    ]);

    // Should return the second "Drums" option since sourceTrack is id2 (second Drums track)
    expect(result).toStrictEqual({
      display_name: "Drums",
      identifier: "drums2",
    });
  });

  it("returns undefined when source track not found in duplicate list", () => {
    (global as Record<string, unknown>).LiveAPI = createMockLiveAPI(
      ["id1", "id2"],
      { id1: "Drums", id2: "Drums" },
    );

    const result = findRouting("id999", "Drums", [
      // id999: non-existent track
      { display_name: "Drums", identifier: "drums1" },
      { display_name: "Drums", identifier: "drums2" },
    ]);

    expect(result).toBeUndefined();
  });
});

interface TrackNameMapping {
  [path: string]: string;
}

interface MockLiveAPIInstance {
  path: string;
  _isLiveSet?: boolean;
  getChildIds: (property: string) => string[];
  getProperty: (prop: string) => string | null;
  id: string;
}

interface MockLiveAPIConstructor {
  new (path: string): MockLiveAPIInstance;
  from: (idOrPath: string | { toString: () => string }) => MockLiveAPIInstance;
}

/**
 * Helper to create a mock LiveAPI class for testing duplicate routing scenarios
 * @param trackIds - Array of track IDs
 * @param trackNameMapping - Mapping of paths to track names
 * @returns Mock LiveAPI constructor
 */
function createMockLiveAPI(
  trackIds: string[],
  trackNameMapping: TrackNameMapping,
): MockLiveAPIConstructor {
  class MockLiveAPI implements MockLiveAPIInstance {
    path: string;
    _isLiveSet?: boolean;

    constructor(path: string) {
      this.path = path;

      if (path === livePath.liveSet) {
        this._isLiveSet = true;
      }
    }

    static from(idOrPath: string | { toString: () => string }): MockLiveAPI {
      return new MockLiveAPI(String(idOrPath));
    }

    getChildIds(property: string): string[] {
      if (this._isLiveSet && property === "tracks") {
        return trackIds;
      }

      return [];
    }

    getProperty(prop: string): string | null {
      if (prop === "name" && trackNameMapping[this.path]) {
        return trackNameMapping[this.path]!;
      }

      return null;
    }

    get id(): string {
      return this.path;
    }
  }

  return MockLiveAPI;
}

// Builds a stub source track with the given id and resolves its routing option.
function findRouting(
  sourceId: string,
  targetName: string,
  availableTypes: RoutingType[],
): RoutingType | undefined {
  const sourceTrack = { id: sourceId, getProperty: () => {} };

  return findRoutingOptionForDuplicateNames(
    sourceTrack as unknown as LiveAPI,
    targetName,
    availableTypes,
  );
}
