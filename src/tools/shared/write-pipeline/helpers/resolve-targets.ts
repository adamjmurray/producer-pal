// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { validateListLengths } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  type Call,
  type MaybePromise,
  type Target,
  type WriteSpec,
} from "../write-pipeline-types.ts";
import { afterMaybe } from "./maybe-async.ts";

/** What the first two stages hand the write loop. */
export interface Resolved<P, Checked> {
  targets: Array<Target<P>>;
  checked: Checked;
}

/**
 * Stages 1 to 3: read the call, name the targets, compare the lists, check the
 * call. Any throw refuses the whole call, and nothing has been written yet.
 * @param spec - The tool's hooks
 * @param args - The tool's args
 * @param call - The call's shared state
 * @returns The targets and what the check found
 */
export function resolveTargets<
  Args,
  Parsed,
  P,
  Checked,
  E extends object,
  Each,
>(
  spec: WriteSpec<Args, Parsed, P, Checked, E, Each>,
  args: Args,
  call: Call,
): MaybePromise<Resolved<P, Checked>> {
  const parsed = spec.parse(args, call);
  const targets = spec.targets(parsed, call);

  validateListLengths(spec.lists?.(parsed) ?? []);

  return afterMaybe(
    spec.check(parsed, targets, call),
    (checked): Resolved<P, Checked> => ({ targets, checked }),
  );
}
