// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type InsertionSpot } from "../../lists/insertion-plan.ts";
import {
  type InsertionRun,
  type Placed,
  insertFailed,
  insertMade,
  insertionFor,
  placesAfter,
  startInsertionRun,
} from "../../lists/insertion-run.ts";

/** What a simulated call ended with. */
interface Outcome {
  run: InsertionRun;
  /** The container, as Live would hold it */
  ids: string[];
  /** The index each insert was asked to create at, in order */
  creates: Array<number | "end">;
  places: Array<Placed | null>;
}

/**
 * Run a call against a container that behaves like Live: an index past the end
 * is refused, and a failed insert makes nothing (or only its padding).
 * @param spots - Where each entry goes
 * @param existing - How many objects the container holds
 * @param padsGaps - Fill a gap past the end (scenes)
 * @param fails - The entries whose insert throws
 * @param padsBeforeFailing - Whether a failing entry pads before it throws
 * @param stopAt - The first entry that never runs, as when the deadline hits
 * @returns What the call left
 */
function simulate(
  spots: InsertionSpot[],
  existing: number,
  padsGaps: boolean,
  fails: number[] = [],
  padsBeforeFailing = false,
  stopAt = spots.length,
): Outcome {
  const ids = Array.from({ length: existing }, (_, i) => `id old${i}`);
  const run = startInsertionRun(spots, [...ids], padsGaps);
  const creates: Array<number | "end"> = [];

  for (let entry = 0; entry < stopAt; entry++) {
    const insertion = insertionFor(run, entry, () => [...ids]);

    const padded: string[] = [];

    if (!fails.includes(entry) || padsBeforeFailing) {
      for (let pad = 0; pad < insertion.padCount; pad++) {
        padded.push(`id pad${entry}.${pad}`);
        ids.push(`id pad${entry}.${pad}`);
      }
    }

    // Live refuses an index past the end (an entry that fails is what Live refused).
    if (!fails.includes(entry)) {
      expect(insertion.atIndex).toBeLessThanOrEqual(ids.length);
    }

    creates.push(insertion.insertIndex);

    if (fails.includes(entry)) {
      insertFailed(run, entry, { ids: padded, reason: "refused" });
      continue;
    }

    const id = `id new${entry}`;

    if (insertion.insertIndex === "end") {
      ids.push(id);
    } else {
      ids.splice(insertion.insertIndex, 0, id);
    }

    insertMade(run, entry, id);
  }

  return { run, ids, creates, places: placesAfter(run, () => [...ids]) };
}

/**
 * Whether every entry that made an object is named where it sits.
 * @param outcome - What a simulated call left
 * @returns One [named, actual] pair per entry that made an object
 */
function namedAgainstActual(outcome: Outcome): number[][] {
  return outcome.run.made.flatMap((id, entry) =>
    id == null
      ? []
      : [[outcome.places[entry]?.finalIndex ?? -1, outcome.ids.indexOf(id)]],
  );
}

const CALLS: Array<[string, InsertionSpot[], number, boolean]> = [
  ["tracks, same spot", [2, 2, 2], 2, false],
  ["tracks, an earlier one lands after a later one", [1, 0, 3], 2, false],
  ["tracks, mixed with appends", [0, "end", 1, "end"], 3, false],
  ["scenes, appended", ["end", "end", "end"], 2, true],
  ["scenes, past the end out of order", [6, 5, 3], 2, true],
  ["scenes, inside and past the end", [1, 6, 0, 4], 3, true],
];

describe("an insertion run", () => {
  describe.each(CALLS)("%s", (_name, spots, existing, padsGaps) => {
    it("names every object where it sits when every insert landed", () => {
      const outcome = simulate(spots, existing, padsGaps);

      for (const [named, actual] of namedAgainstActual(outcome)) {
        expect(named).toBe(actual);
      }

      expect(outcome.run.stale).toBe(false);
    });

    it.each(spots.map((_spot, entry) => entry))(
      "keeps its inserts in range and names objects where they sit when entry %i fails",
      (failing) => {
        for (const padsFirst of [false, true]) {
          const outcome = simulate(
            spots,
            existing,
            padsGaps,
            [failing],
            padsFirst,
          );

          for (const [named, actual] of namedAgainstActual(outcome)) {
            expect(named).toBe(actual);
          }

          expect(outcome.run.made[failing]).toBeNull();
        }
      },
    );
  });

  it("plans the entries after a failed one as if it was never named", () => {
    // t2,t2,t2 with the middle one failing: the third goes after the first.
    const failed = simulate([2, 2, 2], 2, false, [1]);
    const fresh = simulate([2, 2], 2, false);

    expect(failed.creates).toStrictEqual([2, 3, 3]);
    expect(failed.creates.filter((_, i) => i !== 1)).toStrictEqual(
      fresh.creates,
    );
  });

  it("leaves an earlier entry where it is when a later one that would have moved it fails", () => {
    // The second would have pushed the first down a slot.
    const outcome = simulate([1, 0], 2, false, [1]);

    expect(outcome.places[0]?.finalIndex).toBe(1);
    expect(outcome.places[1]).toBeNull();
  });

  it("counts the empty scenes made below a scene that filled a gap", () => {
    const outcome = simulate([5], 2, true);

    expect(outcome.places[0]).toStrictEqual({ finalIndex: 5, emptyBelow: 3 });
  });

  it("claims every empty scene a landed entry padded when later entries never ran", () => {
    // s7 pads four scenes on the assumption that s4 and s5 fill two of them.
    const spots: InsertionSpot[] = [7, 4, 5, 4];

    for (const stopAt of [1, 2, 3, 4]) {
      const outcome = simulate(spots, 2, true, [], false, stopAt);
      const padded = outcome.ids.filter((id) => id.startsWith("id pad"));
      const claimed = outcome.places.reduce(
        (sum, place) => sum + (place?.emptyBelow ?? 0),
        0,
      );

      expect(claimed, `stopped at ${stopAt}`).toBe(padded.length);
    }
  });

  it("claims none of the empty scenes a failed entry left, and leaves the rest planned around them", () => {
    // The failed entry padded two scenes and then Live refused its insert.
    const outcome = simulate([5, 3, "end"], 2, true, [0], true);
    const left = outcome.ids.filter((id) => id.startsWith("id pad"));

    expect(left.length).toBeGreaterThan(0);
    expect(
      outcome.places.reduce((sum, place) => sum + (place?.emptyBelow ?? 0), 0),
    ).toBe(0);

    for (const [named, actual] of namedAgainstActual(outcome)) {
      expect(named).toBe(actual);
    }
  });

  it("keeps an object a failed track insert left behind where it is", () => {
    // Live threw after making the track. It isn't a scene's padding, so the
    // next entry still goes where the caller read its index, ahead of it.
    const ids = ["id a", "id b"];
    const run = startInsertionRun([2, 2], [...ids]);

    insertionFor(run, 0, () => ids);
    ids.push("id stray");
    insertFailed(run, 0);

    const insertion = insertionFor(run, 1, () => ids);

    expect(insertion.atIndex).toBe(2);

    ids.splice(2, 0, "id c");
    insertMade(run, 1, "id c");

    expect(placesAfter(run, () => ids)[1]).toStrictEqual({
      finalIndex: 2,
      emptyBelow: 0,
    });
  });

  it("reads the container for names once an entry never made its object", () => {
    // The deadline: nothing after the first entry ran, and nothing failed.
    const run = startInsertionRun([2, 0], ["id a", "id b"]);
    const ids = ["id a", "id b"];

    insertionFor(run, 0, () => ids);
    ids.splice(2, 0, "id c");
    insertMade(run, 0, "id c");

    expect(placesAfter(run, () => ids)).toStrictEqual([
      { finalIndex: 2, emptyBelow: 0 },
      null,
    ]);
  });
});
