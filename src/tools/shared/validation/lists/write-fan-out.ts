// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Writing to every object a call names. One target writes exactly as it always
// did, throw included — a call that can do nothing has nothing to report.

import {
  foundId,
  type IdLookup,
} from "#src/tools/shared/validation/helpers/id-per-path-lookup.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import {
  attemptTarget,
  type NamedTarget,
  type TargetSkip,
} from "#src/tools/shared/validation/lists/named-targets.ts";

/** What a write tool returns: one object, or one entry per target named. */
export type WriteResult<T> = T | Array<T | TargetSkip>;

/**
 * Writes to every target a call named.
 * @param targets - The targets, in the order the call named them
 * @param writeOne - Writes one target, throwing when it can't
 * @returns The result when one target was named, otherwise one entry per target
 */
export function writeFanOut<T>(
  targets: NamedTarget[],
  writeOne: (target: NamedTarget, index: number) => T,
): WriteResult<T> {
  const [first] = targets;

  if (targets.length < 2) {
    return first == null ? [] : writeOne(first, 0);
  }

  return targets.map((target, index) =>
    attemptTarget(target, () => writeOne(target, index)),
  );
}

/**
 * The object one target names, by whichever param named it. A path resolves the
 * same way a list read does, so a miss reads the same in either tool.
 * @param target - The target, as the caller named it
 * @param noun - What the tool acts on, singular ("track")
 * @param idAtPath - Resolves one path of this kind of object
 * @returns The object
 * @throws Error when the target names none
 */
export function targetObject(
  target: NamedTarget,
  noun: string,
  idAtPath: (entry: string) => IdLookup,
): LiveAPI {
  const id =
    target.param === "id" ? target.value : foundId(idAtPath(target.value));

  return validateIdType(id, noun);
}
