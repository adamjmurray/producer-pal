// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The one way a write tool runs: name the targets, check the call,
// write each target in turn, settle, answer. A tool supplies the parts that
// differ as a WriteSpec; the pipeline keeps the answers that must not differ.
//
// It makes no promise of its own: a hook that awaits is the only async step,
// and each target finishes before the next starts. That is what keeps warnings
// on the response of the request that raised them (v8-warning-capture.ts) — the
// hook's awaits go through suspendWarningCapture, and nothing here can park
// outside one.

import { warnIgnored } from "#src/shared/max/ignored-wording.ts";
import { assembleEntries } from "./helpers/assemble-entries.ts";
import { type CallJournal, callJournal } from "./helpers/call-landed.ts";
import { afterMaybe } from "./helpers/maybe-async.ts";
import { resolveTargets } from "./helpers/resolve-targets.ts";
import { settleSupersession } from "./helpers/settle-supersession.ts";
import {
  type Planned,
  type TargetRun,
  writeLoop,
} from "./helpers/write-loop.ts";
import { supersession } from "./plans/supersession.ts";
import { recordPipelineRun } from "./pipeline-probe.ts";
import {
  type Call,
  type MaybePromise,
  type PipelineResult,
  type Target,
  type WriteSpec,
} from "./write-pipeline-types.ts";

/**
 * Run a write tool.
 * @param spec - The tool's hooks
 * @param args - The tool's args
 * @param ctx - The request's context
 * @returns The lone entry, or one entry per target; a promise only when a hook
 *   returned one
 * @throws Error when the call is refused up front, or its lone target is skipped
 */
export function runWrite<
  Args,
  Parsed,
  P,
  Checked,
  E extends object,
  Each = undefined,
>(
  spec: WriteSpec<Args, Parsed, P, Checked, E, Each>,
  args: Args,
  ctx: Partial<ToolContext> = {},
): MaybePromise<PipelineResult<E>> {
  recordPipelineRun(spec.tool);

  const journal = callJournal();
  const call: Call = { ctx, ignored: warnIgnored, landed: journal.landed };

  return afterMaybe(
    resolveTargets(spec, args, call),
    ({ targets, checked }) => {
      const planned = planWrites(spec, targets, checked, call);

      return afterMaybe(
        journal.guard(() => spec.before?.(checked, call)),
        () =>
          afterMaybe(writeLoop(spec, targets, checked, call, planned), (runs) =>
            finish(spec, { targets, checked, call, planned, runs, journal }),
          ),
      );
    },
  );
}

// --- Helpers below main export ---

/** What the call has once every target has had its turn. */
interface Finished<P, Checked, E, Each> {
  targets: Array<Target<P>>;
  checked: Checked;
  call: Call;
  planned: Planned<Each>;
  runs: Array<TargetRun<E>>;
  journal: CallJournal;
}

/**
 * Stage 5: correct what later targets say about earlier ones, settle, answer.
 * @param spec - The tool's hooks
 * @param done - The targets, what the check found, and each target's run
 * @returns The lone entry, or one entry per target
 */
function finish<Args, Parsed, P, Checked, E extends object, Each>(
  spec: WriteSpec<Args, Parsed, P, Checked, E, Each>,
  done: Finished<P, Checked, E, Each>,
): MaybePromise<PipelineResult<E>> {
  const { targets, checked, call, planned, runs, journal } = done;
  const shortened = settleSupersession(
    runs,
    targets,
    planned.supersession,
    spec.words.rerun,
  );

  const entries = runs.map(({ entry }) => entry);
  const pieces = runs.map((run) => run.pieces);
  const outcomes = runs.map(({ outcome }) => outcome);
  // Before settle: a lone skip throws, and a call that did nothing has no
  // paths to fix up or claims to make.
  const result = assembleEntries(
    entries,
    pieces,
    outcomes,
    spec.loneSkipThrows?.(checked) ?? true,
  );

  return afterMaybe(
    journal.guard(() =>
      spec.settle?.(
        { targets, checked, entries, pieces, outcomes, shortened },
        call,
      ),
    ),
    () => result,
  );
}

/**
 * Decide what the loop writes and in what order: which targets a later one
 * makes pointless, then the tool's own plan for the rest.
 * @param spec - The tool's hooks
 * @param targets - The call's targets, in the order named
 * @param checked - What the tool's check found
 * @param call - The call's shared state
 * @returns The order to write in, and what each write is to know
 */
function planWrites<Args, Parsed, P, Checked, E extends object, Each>(
  spec: WriteSpec<Args, Parsed, P, Checked, E, Each>,
  targets: Array<Target<P>>,
  checked: Checked,
  call: Call,
): Planned<Each> {
  const superseded = supersession(targets);
  const plan = spec.plan?.(targets, checked, call, {
    unwritten: superseded.unwritten,
    shortenedBy: new Map(
      [...superseded.shortened].map(([index, touchers]) => [
        index,
        touchers.map(({ index: later }) => later),
      ]),
    ),
  });

  return {
    order: completeOrder(plan?.order, targets.length),
    each: plan?.each,
    supersession: superseded,
  };
}

/**
 * The order to write in, made to name every target once: a plan that leaves one
 * out still gets it written, last.
 * @param order - The order the plan asked for, if it asked for one
 * @param count - How many targets the call has
 * @returns Every target's index, the plan's choices first
 */
function completeOrder(order: number[] | undefined, count: number): number[] {
  const everyone = Array.from({ length: count }, (_, index) => index);
  const asked = [...new Set(order ?? [])].filter(
    (index) => everyone[index] != null,
  );
  const left = everyone.filter((index) => !asked.includes(index));

  return [...asked, ...left];
}
