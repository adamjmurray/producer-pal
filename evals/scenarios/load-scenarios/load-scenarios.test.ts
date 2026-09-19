// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  listScenarioIds,
  listScenarioSummaries,
  loadScenarios,
} from "./load-scenarios.ts";

const summaries = listScenarioSummaries();

/**
 * Pick a scenario id by what its tags look like, so the tests don't hardcode
 * ids that get renamed.
 *
 * @param match - Predicate over a scenario's tags
 * @returns The first matching scenario's id
 */
function idWhereTags(match: (tags: string[]) => boolean): string {
  const found = summaries.find((s) => match(s.tags));

  if (found == null) {
    throw new Error("no scenario matched the tag predicate");
  }

  return found.id;
}

const pathsId = idWhereTags((tags) => tags.includes("paths"));
const clipsId = idWhereTags(
  (tags) => tags.includes("clips") && !tags.includes("paths"),
);

/**
 * Ids of every scenario carrying any of the given tags, in registration order.
 *
 * @param tags - Tags to match
 * @returns Matching scenario ids
 */
function idsCarrying(tags: string[]): string[] {
  return summaries
    .filter((s) => s.tags.some((tag) => tags.includes(tag)))
    .map((s) => s.id);
}

describe("loadScenarios", () => {
  it("returns everything when nothing is filtered", () => {
    expect(loadScenarios().map((s) => s.id)).toStrictEqual(listScenarioIds());
    expect(
      loadScenarios({ testIds: [], tags: [] }).map((s) => s.id),
    ).toStrictEqual(listScenarioIds());
  });

  it("filters to the requested ids, in registration order", () => {
    const expected = listScenarioIds().filter((id) =>
      [clipsId, pathsId].includes(id),
    );

    expect(
      loadScenarios({ testIds: [pathsId, clipsId] }).map((s) => s.id),
    ).toStrictEqual(expected);
  });

  it("filters to scenarios carrying any requested tag", () => {
    expect(loadScenarios({ tags: ["results"] }).map((s) => s.id)).toStrictEqual(
      idsCarrying(["results"]),
    );
    expect(
      loadScenarios({ tags: ["results", "pairing"] }).map((s) => s.id),
    ).toStrictEqual(idsCarrying(["results", "pairing"]));
  });

  it("intersects ids with tags", () => {
    expect(
      loadScenarios({ testIds: [clipsId, pathsId], tags: ["paths"] }).map(
        (s) => s.id,
      ),
    ).toStrictEqual([pathsId]);
  });

  it("throws when the ids and the tags share nothing", () => {
    expect(() =>
      loadScenarios({ testIds: [clipsId], tags: ["paths"] }),
    ).toThrow(/No scenarios match test\(s\) .* and tag\(s\) paths/);
  });

  it("warns about an unknown id and runs the known ones", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const ids = loadScenarios({ testIds: [clipsId, "nope"] }).map((s) => s.id);

    expect(ids).toStrictEqual([clipsId]);
    expect(warn).toHaveBeenCalledWith("Warning: Test(s) not found: nope");
  });

  it("throws when no requested id exists", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => loadScenarios({ testIds: ["nope"] })).toThrow(
      /No scenarios match test\(s\) nope/,
    );
  });
});
