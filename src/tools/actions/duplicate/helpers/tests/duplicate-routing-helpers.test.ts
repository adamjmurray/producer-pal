// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  findRoutingOptionForDuplicateNames,
  type RoutingType,
} from "../duplicate-routing-helpers.ts";

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

  it("warns and returns undefined when the source track is not among the duplicates", () => {
    const warnSpy = vi.spyOn(console, "warn");

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
    expect(warnSpy).toHaveBeenCalledWith(
      'Could not find source track id 99 in the duplicate name list for "Bass"',
    );
  });
});
