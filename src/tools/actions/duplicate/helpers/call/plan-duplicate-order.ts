// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The order the copies are made in. Copies land on each other, so the order is
// part of what they do: track copies each land right after their source, so the
// last made sits nearest it; a clip copy a later one cuts short is made before
// it; and a copy on the source clip's own span is made after the rest, which
// would otherwise copy what it left of the source.

import {
  type Plan,
  type Superseded,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { copiesOverSource, copySpanBeats } from "../clip/copy-plan.ts";
import { liveObject, meterOf } from "./duplicate-run.ts";
import {
  type ArrangementCopy,
  type CopyBody,
  type CopyLabel,
  type DuplicateRun,
  type DuplicateTarget,
} from "./duplicate-call-types.ts";

/** A copy that will be written, with the place it has in the call. */
interface Written {
  index: number;
  body: CopyBody;
  label: CopyLabel;
  named: string;
}

/**
 * Decide the order the copies are written in.
 * @param targets - The call's copies, in the order named
 * @param superseded - The copies nothing will write, and the ones a later copy
 *   cuts short
 * @param run - The call's shared state
 * @returns The order to write in
 * @throws Error when a copy that has to be made last must also come before
 *   another
 */
export function planDuplicateOrder(
  targets: DuplicateTarget[],
  superseded: Superseded,
  run: DuplicateRun,
): Plan {
  const bySource = new Map<string, Written[]>();

  for (const [index, target] of targets.entries()) {
    if (target.skip != null || superseded.unwritten.has(index)) {
      continue;
    }

    const { body, label } = target.data;
    const key = "sourceId" in body ? body.sourceId : String(index);

    bySource.set(key, [
      ...(bySource.get(key) ?? []),
      { index, body, label, named: target.named.value },
    ]);
  }

  return {
    order: [...bySource.values()].flatMap((group) =>
      orderOneSource(group, superseded, run),
    ),
  };
}

// --- Helpers below main export ---

/**
 * The order one source's copies are written in.
 * @param group - This source's copies that will be written, in call order
 * @param superseded - What later copies do to earlier ones
 * @param run - The call's shared state
 * @returns The copies' indexes, in the order to write them
 */
function orderOneSource(
  group: Written[],
  superseded: Superseded,
  run: DuplicateRun,
): number[] {
  const indexes = group.map(({ index }) => index);
  const kind = (group[0] as Written).body.kind;

  // Each track copy lands right after the source, ahead of the ones made
  // before it. Making them last to first leaves them in the order named.
  if (kind === "track") {
    return indexes.toReversed();
  }

  return kind === "arrangement"
    ? arrangementOrder(group, superseded, run)
    : indexes;
}

/**
 * Order a source's arrangement copies: those that land on the source clip
 * last, and a copy a later one cuts short before the one that cuts it.
 * @param group - The source's copies that will be written, in call order
 * @param superseded - What later copies do to earlier ones
 * @param run - The call's shared state
 * @returns The copies' indexes, in the order to write them
 * @throws Error when no order does both
 */
function arrangementOrder(
  group: Written[],
  superseded: Superseded,
  run: DuplicateRun,
): number[] {
  // A source's group holds only its arrangement copies.
  const copies = group.map(({ body, label }) => ({
    body: body as ArrangementCopy,
    label,
  }));
  const source = liveObject(
    run,
    (copies[0] as (typeof copies)[number]).body.sourceId,
  );
  const { numerator, denominator } = meterOf(run);
  const over = copiesOverSource(
    source,
    copies.map(({ body }) => body.target),
    copies.map(({ body }) => body.startBeats),
    copies.map(({ label }) =>
      copySpanBeats(source, label.length, numerator, denominator),
    ),
  );
  const late = new Set([...over].map((at) => (group[at] as Written).index));
  const indexes = group.map(({ index }) => index);
  // The copies the source can't spare go last, each part in the order named.
  const base = [
    ...indexes.filter((index) => !late.has(index)),
    ...indexes.filter((index) => late.has(index)),
  ];
  const ordered = cutShortFirst(base, superseded);

  refuseUnorderable(group, ordered, late);

  return ordered;
}

/**
 * Move each copy that a later one cuts short ahead of the copies that cut it,
 * changing nothing else.
 * @param base - The order so far
 * @param superseded - What later copies do to earlier ones
 * @returns The order, with every cut-short copy before the copies cutting it
 */
function cutShortFirst(base: number[], superseded: Superseded): number[] {
  const waitsFor = new Map<number, number[]>();

  for (const [earlier, laters] of superseded.shortenedBy) {
    for (const later of laters) {
      waitsFor.set(later, [...(waitsFor.get(later) ?? []), earlier]);
    }
  }

  const ordered: number[] = [];
  const left = [...base];

  while (left.length > 0) {
    // A copy only ever waits on an earlier one, never the other way round, so
    // some copy is always ready.
    const at = left.findIndex((index) =>
      (waitsFor.get(index) ?? []).every(
        (earlier) => ordered.includes(earlier) || !base.includes(earlier),
      ),
    );

    ordered.push(left.splice(at, 1)[0] as number);
  }

  return ordered;
}

/**
 * Refuses an order in which a copy on the source's own span is made before one
 * that has to copy the whole source.
 * @param group - The source's copies that will be written
 * @param ordered - The order to write in
 * @param late - The copies that land on the source's own span
 * @throws Error naming the two copies
 */
function refuseUnorderable(
  group: Written[],
  ordered: number[],
  late: ReadonlySet<number>,
): void {
  const firstLate = ordered.findIndex((index) => late.has(index));
  const after = ordered.findIndex(
    (index, at) => firstLate >= 0 && at > firstLate && !late.has(index),
  );

  if (after === -1) {
    return;
  }

  const [over, other] = [ordered[firstLate], ordered[after]].map(
    (index) => group.find((copy) => copy.index === index)?.named,
  );

  throw new Error(
    `the copy to "${over}" lands on the source clip itself, so it has to be ` +
      `made after the others, but the copy to "${other}" lands over part of ` +
      `it and has to be made after it. Split them into two calls.`,
  );
}
