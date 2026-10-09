// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The order the copies are made in: the order named, because copies land on
// each other and the later one wins, whichever source it came from. The
// exceptions are per source: track copies each land right after their source,
// so a source's are made last to first to end up in the order named; and a clip
// copy on the source clip's own span is made after the source's other copies,
// which would otherwise copy what it left of the source. When a source has two
// or more of those, each would also trim the source for the next, so the plan
// tells them to copy a spare of it instead (see duplicate-run.ts).

import {
  type Plan,
  type Superseded,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { copiesOverSource, copySpanBeats } from "../clip/copy-plan.ts";
import { liveObject, meterOf } from "./duplicate-run.ts";
import {
  type ArrangementCopy,
  type CopyBody,
  type CopyLabel,
  type DuplicateRun,
  type DuplicateTarget,
  type LateCopy,
} from "./duplicate-call-types.ts";

/** A copy that will be written, with the place it has in the call. */
interface Written {
  index: number;
  body: CopyBody;
  label: CopyLabel;
  named: string;
}

/** The copies of one source clip or object, in call order. */
type Group = Written[];

/** A source's arrangement copies, and which of them land on the source itself. */
interface Landing {
  /** The indexes of the copies that land on the source clip */
  indexes: number[];
  /** Whether a spare of the source can stand in for it */
  sparable: boolean;
  /** The source's track, when it has one */
  trackIndex: number | null;
  /** How far every one of the copies reaches, on the track it lands on */
  reaches: Array<{ trackIndex: number; end: number }>;
}

/**
 * Decide the order the copies are written in.
 * @param targets - The call's copies, in the order named
 * @param superseded - The copies nothing will write, and the ones a later copy
 *   cuts short
 * @param run - The call's shared state
 * @returns The order to write in, and for the copies made from a spare of
 *   their source, what that needs
 * @throws Error when a copy that has to be made last must also come before
 *   another
 */
export function planDuplicateOrder(
  targets: DuplicateTarget[],
  superseded: Superseded,
  run: DuplicateRun,
): Plan<LateCopy | undefined> {
  const groups = new Map<string, Group>();

  for (const [index, target] of targets.entries()) {
    if (target.skip != null || superseded.unwritten.has(index)) {
      continue;
    }

    const { body, label } = target.data;
    const key = sourceKey(body, index);

    groups.set(key, [
      ...(groups.get(key) ?? []),
      { index, body, label, named: target.named.value },
    ]);
  }

  const landings = [...groups.values()].map((group) =>
    landingOnSource(group, run),
  );
  const late = new Set(landings.flatMap(({ indexes }) => indexes));

  return {
    order: scheduled(groups, late, superseded),
    each: spareNeeds(landings, targets.length),
  };
}

// --- Helpers below main export ---

/**
 * What a copy is grouped by: its source, or itself when it has none.
 * @param body - The copy
 * @param index - Its place in the call
 * @returns The key
 */
function sourceKey(body: CopyBody, index: number): string {
  return "sourceId" in body ? body.sourceId : String(index);
}

/**
 * A source's copies that land on the source clip itself.
 * @param group - The source's copies that will be written, in call order
 * @param run - The call's shared state
 * @returns Which copies land on the source, whether a spare can stand in for
 *   it, its track, and how far each copy reaches
 */
function landingOnSource(group: Group, run: DuplicateRun): Landing {
  const first = (group[0] as Written).body;

  if (first.kind !== "arrangement") {
    return { indexes: [], sparable: false, trackIndex: null, reaches: [] };
  }

  // A source's group holds only its arrangement copies.
  const copies = group.map(({ body, label }) => ({
    body: body as ArrangementCopy,
    label,
  }));
  const source = liveObject(run, first.sourceId);
  const { numerator, denominator } = meterOf(run);
  const spans = copies.map(({ label }) =>
    copySpanBeats(source, label.length, numerator, denominator),
  );
  const over = copiesOverSource(
    source,
    copies.map(({ body }) => body.target),
    copies.map(({ body }) => body.startBeats),
    spans,
  );

  return {
    indexes: [...over].map((at) => (group[at] as Written).index),
    // A take-lane clip can neither be duplicated nor deleted through the API,
    // so it has no spare. Without a track there is nowhere to put one.
    sparable: !isTakeLaneClip(source) && source.trackIndex != null,
    trackIndex: source.trackIndex,
    reaches: copies.map(({ body }, at) => ({
      trackIndex: body.target.trackIndex,
      end: body.startBeats + (spans[at] as number),
    })),
  };
}

/**
 * What each copy made from a spare is told, by its place in the call.
 * @param landings - Each source's copies, and which land on itself
 * @param count - How many targets the call has
 * @returns One entry per target, empty for a copy that needs no spare
 */
function spareNeeds(
  landings: Landing[],
  count: number,
): Array<LateCopy | undefined> {
  const needs: Array<LateCopy | undefined> = Array.from(
    { length: count },
    () => undefined,
  );
  // The spare has to sit past every copy of the call on its track, not only the
  // late ones: another source's copy made between them could land on it.
  const reach = new Map<number, number>();

  for (const { trackIndex, end } of landings.flatMap((each) => each.reaches)) {
    reach.set(trackIndex, Math.max(end, reach.get(trackIndex) ?? 0));
  }

  for (const { indexes, sparable, trackIndex } of landings) {
    if (sparable && indexes.length >= 2) {
      for (const index of indexes) {
        needs[index] = {
          copies: indexes.length,
          clearBeats: reach.get(trackIndex as number) ?? 0,
        };
      }
    }
  }

  return needs;
}

/**
 * Put the copies in call order, then hold back the ones that must wait: a copy
 * on its source clip's own span waits for the source's other copies, and a
 * copy another one cuts short is already ahead of it.
 * @param groups - The copies that will be written, by source
 * @param late - The copies that land on their own source clip
 * @param superseded - What later copies do to earlier ones
 * @returns The order to write in
 * @throws Error when no order does both
 */
function scheduled(
  groups: Map<string, Group>,
  late: ReadonlySet<number>,
  superseded: Superseded,
): number[] {
  const base = callOrder(groups);
  const copies = new Map(
    [...groups.values()].flatMap((group) =>
      group.map((copy) => [copy.index, { copy, group }] as const),
    ),
  );
  // The copies that cut an earlier one short wait for it.
  const cuts = new Map<number, number[]>();

  for (const [earlier, laters] of superseded.shortenedBy) {
    for (const later of laters) {
      if (copies.has(earlier) && copies.has(later)) {
        cuts.set(later, [...(cuts.get(later) ?? []), earlier]);
      }
    }
  }

  const done = new Set<number>();
  const ordered: number[] = [];
  // What a copy still waits for. A copy on its source clip waits for the rest
  // of that source's copies.
  const blockers = (index: number): number[] =>
    [
      ...(cuts.get(index) ?? []),
      ...(late.has(index)
        ? (copies.get(index) as { group: Group }).group
            .map((other) => other.index)
            .filter((other) => !late.has(other))
        : []),
    ].filter((other) => !done.has(other));

  let from = 0;

  while (ordered.length < base.length) {
    while (done.has(base[from] as number)) {
      from++;
    }

    let at = from;

    while (
      at < base.length &&
      (done.has(base[at] as number) || blockers(base[at] as number).length > 0)
    ) {
      at++;
    }

    if (at === base.length) {
      throw unorderable(
        base.filter((index) => !done.has(index)),
        blockers,
        late,
        (index) => copies.get(index) as { copy: Written; group: Group },
      );
    }

    done.add(base[at] as number);
    ordered.push(base[at] as number);
  }

  return ordered;
}

/**
 * The copies in call order, except that a source's track copies are made last
 * to first, each in the place of one of its own.
 * @param groups - The copies that will be written, by source
 * @returns The indexes, in the order to start from
 */
function callOrder(groups: Map<string, Group>): number[] {
  const order = [...groups.values()]
    .flat()
    .map(({ index }) => index)
    .toSorted((a, b) => a - b);
  const placeOf = new Map(order.map((index, place) => [index, place]));

  for (const group of groups.values()) {
    if ((group[0] as Written).body.kind !== "track") {
      continue;
    }

    // Each track copy lands right after the source, ahead of the ones made
    // before it. Making them last to first leaves them in the order named.
    const indexes = group.map(({ index }) => index);

    for (const [at, index] of indexes.toReversed().entries()) {
      order[placeOf.get(indexes[at] as number) as number] = index;
    }
  }

  return order;
}

/**
 * The error for copies that each have to wait for another. A copy on the source
 * clip itself has to come after the source's other copies, so one of those
 * can't also have to come after it.
 * @param left - The copies still to write, in call order
 * @param blockers - What a copy still waits for
 * @param late - The copies that land on their own source clip
 * @param lookup - Finds a copy and its source's copies by its index
 * @returns The error, naming the two copies
 */
function unorderable(
  left: number[],
  blockers: (index: number) => number[],
  late: ReadonlySet<number>,
  lookup: (index: number) => { copy: Written; group: Group },
): Error {
  // Waits that only look back at an earlier copy can't loop, so every ring
  // passes through a copy on its source clip waiting for one of the source's
  // others, which in turn waits (through whatever) for it.
  const [over, other] = left
    .filter((index) => late.has(index))
    .flatMap((index) =>
      lookup(index)
        .group.map((copy) => copy.index)
        .filter(
          (each) =>
            left.includes(each) &&
            !late.has(each) &&
            waitsFor(each, index, blockers),
        )
        .map((each) => [index, each] as const),
    )[0] as readonly [number, number];

  return new Error(
    `the copy to "${lookup(over).copy.named}" lands on the source clip ` +
      `itself, so it has to be made after the others, but the copy to ` +
      `"${lookup(other).copy.named}" has to be made after it. Split them ` +
      `into two calls.`,
  );
}

/**
 * Whether a copy waits for another, through any copies between.
 * @param index - The copy
 * @param target - The copy it might wait for
 * @param blockers - What a copy still waits for
 * @param seen - The copies already looked at
 * @returns True when it does
 */
function waitsFor(
  index: number,
  target: number,
  blockers: (index: number) => number[],
  seen = new Set<number>(),
): boolean {
  return blockers(index).some((wait) => {
    if (wait === target) {
      return true;
    }

    if (seen.has(wait)) {
      return false;
    }

    seen.add(wait);

    return waitsFor(wait, target, blockers, seen);
  });
}
