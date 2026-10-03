// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The one way a write tool runs (ADR-0058): name the targets, check the call,
// write each target in turn, settle, answer. A tool supplies the parts that
// differ as a WriteSpec; the pipeline keeps the answers that must not differ.
//
// It makes no promise of its own: a hook that awaits is the only async step,
// and each target finishes before the next starts. That is what keeps warnings
// on the response of the request that raised them (v8-warning-capture.ts) — the
// hook's awaits go through suspendWarningCapture, and nothing here can park
// outside one.

import * as console from "#src/shared/max/v8-max-console.ts";
import { assembleEntries } from "./helpers/assemble-entries.ts";
import { afterMaybe } from "./helpers/maybe-async.ts";
import { resolveTargets } from "./helpers/resolve-targets.ts";
import { writeLoop } from "./helpers/write-loop.ts";
import { recordPipelineRun } from "./pipeline-probe.ts";
import {
  type Call,
  type MaybePromise,
  type PipelineResult,
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
export function runWrite<Args, Parsed, P, Checked, E extends object>(
  spec: WriteSpec<Args, Parsed, P, Checked, E>,
  args: Args,
  ctx: Partial<ToolContext> = {},
): MaybePromise<PipelineResult<E>> {
  recordPipelineRun(spec.tool);

  const call: Call = { ctx, ignored: warnIgnored };

  return afterMaybe(resolveTargets(spec, args, call), ({ targets, checked }) =>
    afterMaybe(
      writeLoop(spec, targets, checked, call),
      ({ entries, outcomes }) => {
        // Before settle: a lone skip throws, and a call that did nothing has no
        // paths to fix up or claims to make.
        const result = assembleEntries(entries, outcomes);

        spec.settle?.({ targets, checked, entries, outcomes }, call);

        return result;
      },
    ),
  );
}

/**
 * Warn that a whole-call param did nothing, in the one wording for it.
 * @param param - The param, or what the caller sent
 * @param why - Why it did nothing
 */
function warnIgnored(param: string, why: string): void {
  console.warn(`${param} ignored: ${why}`);
}
