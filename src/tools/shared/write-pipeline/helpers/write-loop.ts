// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import { isDeadlineExceeded } from "#src/shared/max/v8-request-deadline.ts";
import {
  type NamedTarget,
  namedLaterReason,
  noteEntry,
  skipEntry,
  unreachedDetail,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { lastWinsTargets } from "../plans/last-wins.ts";
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
import { landedDetail } from "./landed-detail.ts";
import { afterMaybe } from "./maybe-async.ts";

/** What the loop made of every target. */
export interface Written<E> {
  entries: Array<AnyEntry<E>>;
  outcomes: Outcome[];
}

/** One target's turn. */
interface TargetRun<E> {
  entry: AnyEntry<E>;
  outcome: Outcome;
}

/** What a target's write said had changed before it threw. */
interface Journal {
  phrases: string[];
  partial: Record<string, unknown>;
}

/**
 * Stage 4: write the targets one at a time, in the order named. A target a
 * later one overrides is left unwritten, one that can't be applied or that the
 * deadline never reached gets a skip, and one that throws gets the entry its
 * failure earns. The rest still run. A target is never started before the one
 * ahead of it has finished, so an awaited step can't overlap another.
 * @param spec - The tool's hooks
 * @param targets - The call's targets, in the order named
 * @param checked - What the tool's check found
 * @param call - The call's shared state
 * @returns One entry and outcome per target, as a promise only if a write was one
 */
export function writeLoop<Args, Parsed, P, Checked, E extends object>(
  spec: WriteSpec<Args, Parsed, P, Checked, E>,
  targets: Array<Target<P>>,
  checked: Checked,
  call: Call,
): MaybePromise<Written<E>> {
  const overriddenBy = lastWinsTargets(targets);
  const runs: Array<TargetRun<E>> = [];

  const next = (): MaybePromise<void> => {
    while (runs.length < targets.length) {
      const index = runs.length;
      const target = targets[index] as Target<P>;
      const later = overriddenBy.get(index);
      const run =
        later == null
          ? runTarget(spec, target, { index, checked, call })
          : overridden<E>(target.named, targets[later] as Target<P>);

      if (run instanceof Promise) {
        return run.then((done) => {
          runs.push(done);

          return next();
        });
      }

      runs.push(run);
    }
  };

  return afterMaybe(next(), (): Written<E> => ({
    entries: runs.map(({ entry }) => entry),
    outcomes: runs.map(({ outcome }) => outcome),
  }));
}

// --- Helpers below main export ---

/**
 * The entry for a target a later mention of the same object overrides.
 * @param target - The overridden target, as named
 * @param later - The target that overrides it
 * @returns Its entry, left unwritten
 */
function overridden<E>(
  target: NamedTarget,
  later: Target<unknown>,
): TargetRun<E> {
  return {
    entry: noteEntry(target, namedLaterReason(later.named)),
    outcome: "superseded",
  };
}

/**
 * Turn a target's own problem, or a deadline, into its skip entry.
 * @param target - The target, as named
 * @param detail - Why nothing was written
 * @returns The skip
 */
function skipped<E>(target: NamedTarget, detail: string): TargetRun<E> {
  return { entry: skipEntry(target, detail), outcome: "skipped" };
}

/**
 * Take one target's turn.
 * @param spec - The tool's hooks
 * @param target - The target
 * @param context - Where it sits in the call, and what its write needs
 * @param context.index - Its place in the call
 * @param context.checked - What the tool's check found
 * @param context.call - The call's shared state
 * @returns What came of it, as a promise only if its write was one
 */
function runTarget<Args, Parsed, P, Checked, E extends object>(
  spec: WriteSpec<Args, Parsed, P, Checked, E>,
  target: Target<P>,
  context: Pick<Step<Checked>, "index" | "checked" | "call">,
): MaybePromise<TargetRun<E>> {
  if (target.skip != null) {
    return skipped(target.named, target.skip);
  }

  if (isDeadlineExceeded(context.call.ctx.deadline ?? null)) {
    return skipped(target.named, unreachedDetail(spec.words.rerun));
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
function attemptWrite<Args, Parsed, P, Checked, E extends object>(
  spec: WriteSpec<Args, Parsed, P, Checked, E>,
  target: AppliedTarget<P>,
  context: Pick<Step<Checked>, "index" | "checked" | "call">,
): MaybePromise<TargetRun<E>> {
  const journal: Journal = { phrases: [], partial: {} };
  const step: Step<Checked> = {
    ...context,
    landed: (phrase, partial = {}) => {
      if (!journal.phrases.includes(phrase)) {
        journal.phrases.push(phrase);
      }

      Object.assign(journal.partial, partial);
    },
  };
  const failed = (error: unknown): TargetRun<E> =>
    failure(target.named, errorMessage(error), journal);

  try {
    const written = spec.write(target, step);

    return written instanceof Promise
      ? written.then((entry) => ({ entry, outcome: "written" }), failed)
      : { entry: written, outcome: "written" };
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
  if (journal.phrases.length === 0) {
    return skipped(target, message);
  }

  const { partial } = journal;
  const addressed = partial.id != null || partial.path != null;

  return {
    entry: {
      ...(addressed ? {} : noteEntry(target, "")),
      ...partial,
      detail: landedDetail(message, journal.phrases),
    },
    outcome: "written",
  };
}
