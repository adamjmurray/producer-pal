// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type Superseded } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { planDuplicateOrder } from "#src/tools/actions/duplicate/helpers/call/plan-duplicate-order.ts";
import {
  type CopyBody,
  type DuplicateRun,
  type DuplicateTarget,
} from "#src/tools/actions/duplicate/helpers/call/duplicate-call-types.ts";

/** A copy of one source, which skips when `skip` says so. */
function copy(body: CopyBody, skip?: string): DuplicateTarget {
  const named = {
    param: "path" as const,
    value: `dest${JSON.stringify(body)}`,
  };

  return skip == null ? { named, data: { body, label: {} } } : { named, skip };
}

/** A call that supersedes nothing. */
function nothing(unwritten: number[] = []): Superseded {
  return { unwritten: new Set(unwritten), shortenedBy: new Map() };
}

/** Copies of the sources named, one per name, in call order. */
function copiesOf(
  kind: "track" | "device",
  ...sources: string[]
): DuplicateTarget[] {
  return sources.map((sourceId) => copy({ kind, sourceId }));
}

/**
 * A run whose sources are arrangement clips: each 16 beats long on its own
 * track, from beat 0.
 * @param sources - The source ids, each on the track of its place in the list
 * @returns The run
 */
function runWithClips(...sources: string[]): DuplicateRun {
  const objects = new Map(
    sources.map((id, trackIndex) => [
      id,
      {
        trackIndex,
        takeLaneIndex: null,
        path: `live_set tracks ${trackIndex} arrangement_clips 0`,
        getProperty: (name: string) =>
          ({ is_arrangement_clip: 1, start_time: 0, end_time: 16 })[name],
      } as unknown as LiveAPI,
    ]),
  );

  return { objects, meter: { numerator: 4, denominator: 4 } } as DuplicateRun;
}

/**
 * An arrangement copy of a source.
 * @param sourceId - The source
 * @param trackIndex - The track it lands on
 * @param startBeats - Where it starts
 * @returns The copy
 */
function arranged(
  sourceId: string,
  trackIndex: number,
  startBeats: number,
): DuplicateTarget {
  return copy({
    kind: "arrangement",
    sourceId,
    turn: 0,
    target: { trackIndex, takeLane: null },
    startBeats,
  });
}

describe("planDuplicateOrder", () => {
  it("keeps the call's order for copies that insert or land in a slot", () => {
    const targets = [
      ...copiesOf("device", "a", "b", "a"),
      copy({
        kind: "slot",
        sourceId: "a",
        turn: 3,
        slot: { trackIndex: 0, sceneIndex: 0 },
      }),
    ];

    expect(
      planDuplicateOrder(targets, nothing(), {} as DuplicateRun).order,
    ).toStrictEqual([0, 1, 2, 3]);
  });

  it("leaves out the copies nothing will write", () => {
    const targets = [
      ...copiesOf("device", "a", "b"),
      copy({ kind: "device", sourceId: "c" }, "no such device"),
      ...copiesOf("device", "a"),
    ];

    expect(
      planDuplicateOrder(targets, nothing([1]), {} as DuplicateRun).order,
    ).toStrictEqual([0, 3]);
  });

  it("ignores a cut that involves a copy nothing will write", () => {
    expect(
      planDuplicateOrder(
        copiesOf("device", "a", "b", "a"),
        { unwritten: new Set([1]), shortenedBy: new Map([[1, [2]]]) },
        {} as DuplicateRun,
      ).order,
    ).toStrictEqual([0, 2]);
  });

  it("makes a source's track copies last to first, wherever they sit", () => {
    expect(
      planDuplicateOrder(
        copiesOf("track", "a", "a", "b", "b"),
        nothing(),
        {} as DuplicateRun,
      ).order,
    ).toStrictEqual([1, 0, 3, 2]);
    expect(
      planDuplicateOrder(
        copiesOf("track", "a", "b", "a", "b"),
        nothing(),
        {} as DuplicateRun,
      ).order,
    ).toStrictEqual([2, 3, 0, 1]);
  });

  it("keeps the call's order for arrangement copies of several sources", () => {
    // a, b, a: none on its own source clip; a later copy cuts copy 0 short.
    const targets = [
      arranged("a", 5, 0),
      arranged("b", 5, 8),
      arranged("a", 5, 16),
    ];

    expect(
      planDuplicateOrder(
        targets,
        { unwritten: new Set(), shortenedBy: new Map([[0, [1]]]) },
        runWithClips("a", "b"),
      ).order,
    ).toStrictEqual([0, 1, 2]);
  });

  it("makes a copy on its own source after that source's others only", () => {
    // Copy 0 lands on a's own span; b's copy between has no say in it.
    const targets = [
      arranged("a", 0, 0),
      arranged("b", 5, 0),
      arranged("a", 5, 0),
    ];

    expect(
      planDuplicateOrder(targets, nothing(), runWithClips("a", "b")).order,
    ).toStrictEqual([1, 2, 0]);
  });

  it("refuses a copy that must be last and also come before another", () => {
    const targets = [arranged("a", 0, 0), arranged("a", 5, 0)];

    expect(() =>
      planDuplicateOrder(
        targets,
        { unwritten: new Set(), shortenedBy: new Map([[0, [1]]]) },
        runWithClips("a"),
      ),
    ).toThrow(/lands on the source clip itself/);
  });

  it("refuses a ring that runs through two sources", () => {
    // 0 (on a) waits for 2; 2 cuts 1 short, so waits for 1; 1 (on b) waits for
    // 3; 3 cuts 0 short, so waits for 0.
    const targets = [
      arranged("a", 0, 0),
      arranged("b", 1, 0),
      arranged("a", 5, 0),
      arranged("b", 5, 0),
    ];

    expect(() =>
      planDuplicateOrder(
        targets,
        {
          unwritten: new Set(),
          shortenedBy: new Map([
            [1, [2]],
            [0, [3]],
          ]),
        },
        runWithClips("a", "b"),
      ),
    ).toThrow(/dest.*"sourceId":"a".*lands on the source clip itself/s);
  });

  it("finds the ring when another ring is in the way", () => {
    // 0 and 1 are on their own sources, so each waits for the other copy of
    // its source (3 and 2). Copy 3 cuts 2 short, so it waits for 2 first, and
    // 2 cuts 1 short; only then does it reach 0, the ring that is reported.
    const targets = [
      arranged("a", 0, 0),
      arranged("b", 1, 0),
      arranged("b", 5, 0),
      arranged("a", 5, 0),
    ];

    expect(() =>
      planDuplicateOrder(
        targets,
        {
          unwritten: new Set(),
          shortenedBy: new Map([
            [1, [2]],
            [2, [3]],
            [0, [3]],
          ]),
        },
        runWithClips("a", "b"),
      ),
    ).toThrow(
      /"sourceId":"a".*lands on the source clip itself.*"sourceId":"a".*has to be made after it\. Split them into two calls\./s,
    );
  });

  describe("copies made from a spare of their source", () => {
    it("tells two copies on their source to copy a spare", () => {
      const targets = [arranged("a", 0, 0), arranged("a", 0, 4)];
      const need = { copies: 2, clearBeats: 20 };

      expect(
        planDuplicateOrder(targets, nothing(), runWithClips("a")).each,
      ).toStrictEqual([need, need]);
    });

    it("tells a lone copy on its source nothing", () => {
      const targets = [arranged("a", 0, 0), arranged("a", 5, 4)];

      expect(
        planDuplicateOrder(targets, nothing(), runWithClips("a")).each,
      ).toStrictEqual([undefined, undefined]);
    });

    it("counts only the copies that will be written", () => {
      const targets = [
        arranged("a", 0, 0),
        arranged("a", 0, 4),
        arranged("a", 0, 8),
      ];

      expect(
        planDuplicateOrder(targets, nothing([1]), runWithClips("a")).each,
      ).toStrictEqual([
        { copies: 2, clearBeats: 24 },
        undefined,
        { copies: 2, clearBeats: 24 },
      ]);
    });

    it("puts the spare past every copy of the call on the track", () => {
      // b's copy is made between a's two, and lands far on a's track.
      const targets = [
        arranged("a", 0, 0),
        arranged("b", 0, 100),
        arranged("a", 0, 4),
      ];

      expect(
        planDuplicateOrder(targets, nothing(), runWithClips("a", "b")).each,
      ).toStrictEqual([
        { copies: 2, clearBeats: 116 },
        undefined,
        { copies: 2, clearBeats: 116 },
      ]);
    });

    it("gives a take-lane source none: its clips can't be deleted", () => {
      const lane = { trackIndex: 0, takeLane: 0 };
      const run = {
        objects: new Map([
          [
            "a",
            {
              trackIndex: 0,
              takeLaneIndex: 0,
              path: "live_set tracks 0 take_lanes 0 arrangement_clips 0",
              getProperty: (name: string) =>
                ({ is_arrangement_clip: 1, start_time: 0, end_time: 16 })[name],
            } as unknown as LiveAPI,
          ],
        ]),
        meter: { numerator: 4, denominator: 4 },
      } as DuplicateRun;
      const onLane = (startBeats: number): DuplicateTarget =>
        copy({
          kind: "arrangement",
          sourceId: "a",
          turn: 0,
          target: lane,
          startBeats,
        });

      expect(
        planDuplicateOrder([onLane(0), onLane(4)], nothing(), run).each,
      ).toStrictEqual([undefined, undefined]);
    });
  });
});
