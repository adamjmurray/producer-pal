// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import {
  type NamedTarget,
  namedLaterReason,
  noteEntry,
  skipEntry,
  unreachedDetailAfter,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { entryAndPieces, type WithPieces } from "../entry-pieces.ts";
import { type Supersession } from "../plans/supersession.ts";
import {
  type AnyEntry,
  type AppliedTarget,
  type Call,
  type MaybePromise,
  type Outcome,
  type Step,
  type Target,
  type WriteSpec,
} from "../write-pipeline-types.ts";
import { landedDetail } from "../landed-detail.ts";
import { afterMaybe } from "./maybe-async.ts";

/** One target's turn: its entry, any extra entries, and what came of it. */
export interface TargetRun<E> {
  entry: AnyEntry<E>;
  pieces: E[];
  outcome: Outcome;
  /** Whether the ground the target declared in `covers` was really written */
  covered: boolean;
  /** Skipped because the deadline never reached it */
  unreached?: boolean;
}

/** What the stages before the loop decided about the writes. */
export interface Planned<Each> {
  /** Every target's index, in the order to write them */
  order: number[];
  each: Each[] | undefined;
  supersession: Supersession;
}

/** What a target's write said had changed before it threw. */
interface Journal {
  phrases: string[];
  partial: Record<string, unknown>;
  covered: boolean;
}

/**
 * Stage 4: write the targets one at a time, in the planned order. A target a
 * later one overrides is left unwritten, one that can't be applied or that the
 * deadline never reached gets a skip, and one that throws gets the entry its
 * failure earns. The rest still run. A target is never started before the one
 * ahead of it has finished, so an awaited step can't overlap another.
 * @param spec - The tool's hooks
 * @param targets - The call's targets, in the order named
 * @param checked - What the tool's check found
 * @param call - The call's shared state
 * @param planned - The order to write in, and what each target is to know
 * @returns One run per target, in the order named, as a promise only if a
 *   write was one
 */
export function writeLoop<Args, Parsed, P, Checked, E extends object, Each>(
  spec: WriteSpec<Args, Parsed, P, Checked, E, Each>,
  targets: Array<Target<P>>,
  checked: Checked,
  call: Call,
  planned: Planned<Each>,
): MaybePromise<Array<TargetRun<E>>> {
  const runs: Array<TargetRun<E>> = [];

  for (const [index, replacement] of planned.supersession.replaced) {
    runs[index] = replaced<E>(
      (targets[index] as Target<P>).named,
      replacement.kind === "named"
        ? namedLaterReason((targets[replacement.by] as Target<P>).named)
        : `overwritten later in this call by ${(replacement.coverers[0] as { as: string }).as}`,
    );
  }

  const queue = planned.order.filter((index) => runs[index] == null);

  const next = (at: number): MaybePromise<void> => {
    for (let place = at; place < queue.length; place++) {
      const index = queue[place] as number;
      const run = runTarget(spec, targets[index] as Target<P>, {
        index,
        checked,
        planned: planned.each?.[index] as Each,
        call,
      });

      if (run instanceof Promise) {
        return run.then((done) => {
          runs[index] = done;

          return next(place + 1);
        });
      }

      runs[index] = run;
    }
  };

  return afterMaybe(next(0), () => runs);
}

// --- Helpers below main export ---

/**
 * The entry for a target a later one replaces.
 * @param target - The replaced target, as named
 * @param detail - Why it was left unwritten
 * @returns Its entry, left unwritten
 */
function replaced<E>(target: NamedTarget, detail: string): TargetRun<E> {
  return {
    entry: noteEntry(target, detail),
    pieces: [],
    outcome: "superseded",
    covered: false,
  };
}

/**
 * Turn a target's own problem, or a deadline, into its skip entry.
 * @param target - The target, as named
 * @param detail - Why nothing was written
 * @param unreached - Whether the deadline skipped it before its turn
 * @returns The skip
 */
function skipped<E>(
  target: NamedTarget,
  detail: string,
  unreached = false,
): TargetRun<E> {
  return {
    entry: skipEntry(target, detail),
    pieces: [],
    outcome: "skipped",
    covered: false,
    unreached,
  };
}

/**
 * Take one target's turn.
 * @param spec - The tool's hooks
 * @param target - The target
 * @param context - Where it sits in the call, and what its write needs
 * @returns What came of it, as a promise only if its write was one
 */
function runTarget<Args, Parsed, P, Checked, E extends object, Each>(
  spec: WriteSpec<Args, Parsed, P, Checked, E, Each>,
  target: Target<P>,
  context: Omit<Step<Checked, Each>, "landed" | "coverLanded">,
): MaybePromise<TargetRun<E>> {
  if (target.skip != null) {
    return skipped(target.named, target.skip);
  }

  const late = unreachedDetailAfter(
    context.call.ctx.deadline,
    spec.words.rerun,
  );

  if (late != null) {
    return skipped(target.named, late, true);
  }

  return attemptWrite(spec, target, context);
}

/**
 * Write one target, turning a throw into the entry it earns: a skip when
 * nothing of the target had landed, otherwise its normal entry plus a detail.
 * @param spec - The tool's hooks
 * @param target - The target, which can be written
 * @param context - Where it sits in the call, and what its write needs
 * @returns What came of it, as a promise only if the write was one
 */
function attemptWrite<Args, Parsed, P, Checked, E extends object, Each>(
  spec: WriteSpec<Args, Parsed, P, Checked, E, Each>,
  target: AppliedTarget<P>,
  context: Omit<Step<Checked, Each>, "landed" | "coverLanded">,
): MaybePromise<TargetRun<E>> {
  const journal: Journal = { phrases: [], partial: {}, covered: false };
  const step: Step<Checked, Each> = {
    ...context,
    landed: (phrase, partial = {}) => {
      if (!journal.phrases.includes(phrase)) {
        journal.phrases.push(phrase);
      }

      Object.assign(journal.partial, partial);
    },
    coverLanded: () => {
      journal.covered = true;
    },
  };
  const failed = (error: unknown): TargetRun<E> =>
    failure(target.named, errorMessage(error), journal);
  const done = (answer: E | WithPieces<E>): TargetRun<E> => ({
    ...entryAndPieces(answer),
    outcome: "written",
    covered: journal.covered,
  });

  try {
    const written = spec.write(target, step);

    return written instanceof Promise
      ? written.then(done, failed)
      : done(written);
  } catch (error) {
    return failed(error);
  }
}

/**
 * The entry for a write that threw.
 * @param target - The target, as named
 * @param message - What the throw said
 * @param journal - What the write said had landed before it threw
 * @returns A skip when nothing landed, else the entry as far as it got
 */
function failure<E>(
  target: NamedTarget,
  message: string,
  journal: Journal,
): TargetRun<E> {
  // A write that only said its cover landed still changed Live.
  if (journal.phrases.length === 0 && !journal.covered) {
    return skipped(target, message);
  }

  const { partial } = journal;
  const addressed = partial.id != null || partial.path != null;

  return {
    entry: {
      ...(addressed ? {} : noteEntry(target, "")),
      ...partial,
      detail:
        journal.phrases.length === 0
          ? message
          : landedDetail(message, journal.phrases),
    },
    pieces: [],
    outcome: "written",
    covered: journal.covered,
  };
}
