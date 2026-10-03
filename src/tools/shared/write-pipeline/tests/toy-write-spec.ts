// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { namedTargets } from "#src/tools/shared/validation/lists/named-targets.ts";
import { type WriteSpec } from "../write-pipeline-types.ts";

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
}

export interface ToyEntry {
  id: string;
  wrote: true;
}

/** What the toy tool saw, in order. */
export interface ToyLog {
  writes: string[];
  settled: Array<{ outcomes: string[]; entries: unknown[] }>;
  /** The most writes that were running at once */
  overlap: number;
}

/**
 * An empty log for a toy tool to write into.
 * @returns The log
 */
export function newToyLog(): ToyLog {
  return { writes: [], settled: [], overlap: 0 };
}

/**
 * A write tool that does nothing but log, with a knob for each way a write can
 * go.
 * @param log - Where it writes down what it saw
 * @returns The spec
 */
export function toySpec(
  log: ToyLog,
): WriteSpec<ToyArgs, ToyArgs, undefined, ToyArgs, ToyEntry> {
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

        return reason == null
          ? {
              named,
              key: args.keys?.[named.value] ?? named.value,
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
    write: ({ named }, { checked, landed }) => {
      const id = named.value;

      const work = (): ToyEntry => {
        log.writes.push(id);

        if (checked.failBefore?.includes(id) === true) {
          throw new Error(`${id} refused`);
        }

        if (checked.failAfter?.includes(id) === true) {
          landed("name");
          throw new Error(`${id} then failed`);
        }

        if (checked.failAfterWithEntry?.includes(id) === true) {
          landed("name", { id });
          landed("name", { id });
          landed("mute");
          throw new Error(`${id} then failed`);
        }

        return { id, wrote: true };
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
    settle: ({ outcomes, entries }) => {
      log.settled.push({ outcomes, entries });
    },
  };
}
