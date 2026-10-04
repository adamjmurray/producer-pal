// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { namedTargets } from "#src/tools/shared/validation/lists/named-targets.ts";
import { type WithPieces, withPieces } from "../entry-pieces.ts";
import { type Cover, type WriteSpec } from "../write-pipeline-types.ts";

/** What a toy call does to each of its targets, by id. */
export interface ToyArgs {
  /** The targets, comma-separated ids */
  ids: string;
  /** Ids that can't be applied, with the reason */
  skip?: Record<string, string>;
  /** Ids whose write throws before anything lands */
  failBefore?: string[];
  /** Ids whose write lands something, then throws */
  failAfter?: string[];
  /** Ids whose write says its cover landed and nothing else, then throws */
  failAfterCoverOnly?: string[];
  /** Ids whose write lands something with a partial entry, then throws */
  failAfterWithEntry?: string[];
  /** Ids whose write is async */
  slow?: string[];
  /** Another list that has to match the targets in length */
  names?: string;
  /** Throw from the check */
  refuse?: boolean;
  /** Ids that name the same object as another (id to key) */
  keys?: Record<string, string>;
  /** Ids that name several objects at once (id to keys), instead of one key */
  manyKeys?: Record<string, string[]>;
  /** What each id's write goes over */
  covers?: Record<string, Cover[]>;
  /** The order to write the targets in, by position in the call */
  order?: number[];
  /** Extra entries an id's write makes, by their ids */
  pieces?: Record<string, string[]>;
  /** Hand each target's write a label from the plan */
  label?: boolean;
  /** Ids whose write lands without writing the ground they declared */
  coverMisses?: string[];
}

export interface ToyEntry {
  id: string;
  wrote: true;
  /** What the plan said about this target, when it said anything */
  planned?: string;
}

/** What the toy tool saw, in order. */
export interface ToyLog {
  writes: string[];
  settled: Array<{
    outcomes: string[];
    entries: unknown[];
    pieces: unknown[];
    shortened: number[];
  }>;
  /** The most writes that were running at once */
  overlap: number;
  /** What the plan was told nothing would write, once per call */
  unwritten: number[][];
  /** What the plan was told a later target cuts short, once per call */
  shortenedBy: Array<Array<[number, number[]]>>;
}

/**
 * An empty log for a toy tool to write into.
 * @returns The log
 */
export function newToyLog(): ToyLog {
  return {
    writes: [],
    settled: [],
    overlap: 0,
    unwritten: [],
    shortenedBy: [],
  };
}

/**
 * A write tool that does nothing but log, with a knob for each way a write can
 * go.
 * @param log - Where it writes down what it saw
 * @returns The spec
 */
export function toySpec(
  log: ToyLog,
): WriteSpec<
  ToyArgs,
  ToyArgs,
  undefined,
  ToyArgs,
  ToyEntry,
  string | undefined
> {
  let running = 0;

  return {
    tool: "toy",
    words: { rerun: "toy" },
    parse: (args) => args,
    lists: (args) => [
      { param: "ids", count: namedTargets({ id: args.ids }).length },
      { param: "names", value: args.names },
    ],
    targets: (args) =>
      namedTargets({ id: args.ids }).map((named) => {
        const reason = args.skip?.[named.value];

        const many = args.manyKeys?.[named.value];

        return reason == null
          ? {
              named,
              ...(many == null
                ? { key: args.keys?.[named.value] ?? named.value }
                : { keys: many }),
              covers: args.covers?.[named.value],
              data: undefined,
            }
          : { named, skip: reason };
      }),
    check: (args) => {
      if (args.refuse === true) {
        throw new Error("refused by the check");
      }

      return args;
    },
    plan: (targets, args, _call, superseded) => {
      log.unwritten.push([...superseded.unwritten]);
      log.shortenedBy.push([...superseded.shortenedBy]);

      return {
        order: args.order,
        each:
          args.label === true
            ? targets.map(({ named }) => `plan:${named.value}`)
            : undefined,
      };
    },
    write: ({ named }, { checked, landed, coverLanded, planned }) => {
      const id = named.value;

      const work = (): ToyEntry | WithPieces<ToyEntry> => {
        log.writes.push(id);

        if (checked.failBefore?.includes(id) === true) {
          throw new Error(`${id} refused`);
        }

        if (checked.failAfter?.includes(id) === true) {
          landed("name");
          coverLanded();
          throw new Error(`${id} then failed`);
        }

        if (checked.failAfterCoverOnly?.includes(id) === true) {
          coverLanded();
          throw new Error(`${id} then failed`);
        }

        if (checked.failAfterWithEntry?.includes(id) === true) {
          landed("name", { id });
          landed("name", { id });
          landed("mute");
          throw new Error(`${id} then failed`);
        }

        if (checked.coverMisses?.includes(id) !== true) {
          coverLanded();
        }

        const entry: ToyEntry = {
          id,
          wrote: true,
          ...(planned == null ? {} : { planned }),
        };
        const extra = checked.pieces?.[id];

        return extra == null
          ? entry
          : withPieces(
              entry,
              extra.map((piece) => ({ id: piece, wrote: true as const })),
            );
      };

      if (checked.slow?.includes(id) !== true) {
        return work();
      }

      running++;
      log.overlap = Math.max(log.overlap, running);

      return Promise.resolve().then(() => {
        running--;

        return work();
      });
    },
    settle: ({ outcomes, entries, pieces, shortened }) => {
      log.settled.push({
        outcomes,
        entries,
        pieces,
        shortened: [...shortened],
      });
    },
  };
}
