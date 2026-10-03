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

export type MaybePromise<T> = T | Promise<T>;

/** A target the tool will write to. */
export interface AppliedTarget<P> {
  /** The caller's spelling; it addresses this target's skip entries */
  named: NamedTarget;
  /** The resolved identity: same key, same object, whatever the spelling */
  key?: string;
  skip?: undefined;
  data: P;
}

/** A target that parsed but can't be applied: it gets a skip entry. */
export interface SkippedTarget {
  named: NamedTarget;
  key?: undefined;
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
export interface Step<Checked> {
  /** The target's place in the call, in the order named */
  index: number;
  checked: Checked;
  call: Call;
  /**
   * Say that something of this target has changed Live. A throw after this
   * keeps the target's normal entry, with a detail naming what landed.
   * @param phrase - What landed, in a few words ("name")
   * @param partial - Entry fields known so far, for that entry
   */
  landed: (phrase: string, partial?: Record<string, unknown>) => void;
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
  outcomes: Outcome[];
}

/** What a write tool returns: the lone entry, or one entry per target. */
export type PipelineResult<E> = E | Array<AnyEntry<E>>;

/**
 * How one write tool fills in the pipeline. `Parsed` is the call as the tool
 * reads it once, so a param that warns when read is read once.
 */
export interface WriteSpec<Args, Parsed, P, Checked, E extends object> {
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
  /** Stage 4: write one target. A throw becomes that target's entry. */
  write: (target: AppliedTarget<P>, step: Step<Checked>) => MaybePromise<E>;
  /** Stage 5: once every target has had its turn: paths, focus, warnings */
  settle?: (done: Done<P, Checked, E>, call: Call) => void;
}
