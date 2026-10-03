// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ListArg } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  type NamedTarget,
  type NoteEntry,
  type TargetSkip,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { type WithPieces } from "./entry-pieces.ts";

export type MaybePromise<T> = T | Promise<T>;

/**
 * What a target's write goes over: a session slot, or a stretch of one
 * arrangement lane. A later target that goes over all of it makes the earlier
 * write pointless; one that goes over part of it cuts the earlier one short.
 */
export type Cover =
  | {
      /** The slot, as a path ("t2/s1") */
      slot: string;
    }
  | {
      /** The lane, as a path ("t0", "t0/l1") */
      lane: string;
      /** The stretch, in beats */
      from: number;
      to: number;
      /** How an entry names the stretch ("t0[5|1]") */
      as: string;
    };

/** A target the tool will write to. */
export interface AppliedTarget<P> {
  /** The caller's spelling; it addresses this target's skip entries */
  named: NamedTarget;
  /** The resolved identity: same key, same object, whatever the spelling */
  key?: string;
  /** What the write goes over, for a later target to replace or cut short */
  covers?: Cover[];
  skip?: undefined;
  data: P;
}

/** A target that parsed but can't be applied: it gets a skip entry. */
export interface SkippedTarget {
  named: NamedTarget;
  key?: undefined;
  covers?: undefined;
  /** Why, in the words a lone target throws */
  skip: string;
  data?: undefined;
}

export type Target<P> = AppliedTarget<P> | SkippedTarget;

/** What every hook of a call shares. */
export interface Call {
  ctx: Partial<ToolContext>;
  /** Warns that a whole-call param did nothing: `X ignored: reason` */
  ignored: (param: string, why: string) => void;
}

/** What one target's write hands the pipeline. */
export interface Step<Checked, Planned = undefined> {
  /** The target's place in the call, in the order named */
  index: number;
  checked: Checked;
  /** What the plan worked out for this target */
  planned: Planned;
  call: Call;
  /**
   * Say that something of this target has changed Live. A throw after this
   * keeps the target's normal entry, with a detail naming what landed.
   * @param phrase - What landed, in a few words ("name")
   * @param partial - Entry fields known so far, for that entry
   */
  landed: (phrase: string, partial?: Record<string, unknown>) => void;
  /**
   * Say that what this target declared in `covers` really was written. A target
   * that declares covers must call this once the ground is written, even if a
   * later step of its write throws: a replaced or cut-short earlier target is
   * only said to be so when the later write that covers it landed.
   */
  coverLanded: () => void;
}

/** What happened to one target. */
export type Outcome = "written" | "skipped" | "superseded";

/** One target's entry: its own, or the pipeline's skip or note. */
export type AnyEntry<E> = E | TargetSkip | NoteEntry;

/** The whole call, once every target has had its turn. */
export interface Done<P, Checked, E> {
  targets: Array<Target<P>>;
  checked: Checked;
  /** One per target, in the order named */
  entries: Array<AnyEntry<E>>;
  /** The extra entries each target's write made, in the order named */
  pieces: E[][];
  outcomes: Outcome[];
  /**
   * The targets a later one went over only part of. Their entries already say
   * so; a tool that finds the same thing out itself needn't say it twice.
   */
  shortened: ReadonlySet<number>;
}

/** What the targets make of each other, known before the first write. */
export interface Superseded {
  /** The targets nothing will write: skipped, named again, or replaced */
  unwritten: ReadonlySet<number>;
  /** Each target a later one goes over only part of, and those later targets */
  shortenedBy: ReadonlyMap<number, number[]>;
}

/** What the plan decides before the first write. */
export interface Plan<Planned = undefined> {
  /** The targets' indexes in the order to write them; call order when absent */
  order?: number[];
  /** What each target's write needs to know, by the target's index */
  each?: Planned[];
}

/** What a write tool returns: the lone entry, or one entry per target. */
export type PipelineResult<E> = E | Array<AnyEntry<E>>;

/**
 * How one write tool fills in the pipeline. `Parsed` is the call as the tool
 * reads it once, so a param that warns when read is read once.
 */
export interface WriteSpec<
  Args,
  Parsed,
  P,
  Checked,
  E extends object,
  Planned = undefined,
> {
  tool: string;
  words: {
    /** What to re-run for after the deadline, e.g. "target" */
    rerun: string;
  };
  /** Stage 1: read and refuse a malformed call. A throw refuses the call. */
  parse: (args: Args, call: Call) => Parsed;
  /** Lists to compare for length, checked before anything is written */
  lists?: (parsed: Parsed) => ListArg[];
  /** Stage 2: name the targets. Reads only; a throw refuses the call. */
  targets: (parsed: Parsed, call: Call) => Array<Target<P>>;
  /** Stage 3: look things up, never write. A throw refuses the call. */
  check: (
    parsed: Parsed,
    targets: Array<Target<P>>,
    call: Call,
  ) => MaybePromise<Checked>;
  /**
   * Stage 4a: decide the order the targets are written in, and what each needs
   * to know. Pure: it reads what the earlier stages found and writes nothing.
   * A target a later one goes over only part of has to be written before that
   * later one, or its write lands on top of it.
   */
  plan?: (
    targets: Array<Target<P>>,
    checked: Checked,
    call: Call,
    superseded: Superseded,
  ) => Plan<Planned>;
  /**
   * Stage 4b: write one target. A throw becomes that target's entry. It may
   * answer with extra entries too (a split clip's pieces): see `withPieces`.
   */
  write: (
    target: AppliedTarget<P>,
    step: Step<Checked, Planned>,
  ) => MaybePromise<E | WithPieces<E>>;
  /** Stage 5: once every target has had its turn: paths, focus, warnings */
  settle?: (done: Done<P, Checked, E>, call: Call) => void;
}
