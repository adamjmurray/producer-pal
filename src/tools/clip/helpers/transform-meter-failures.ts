// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { TransformArgError } from "#src/notation/transform/helpers/note-ops/transform-arg-errors.ts";

/**
 * Read a transform once per distinct meter and decide what each failure means,
 * the same way for every tool that runs transforms.
 *
 * - A mistake that holds in every meter ({@link TransformArgError}) refuses the
 *   call.
 * - Any other failure (a bar|beat range or a constant that mixes note values or
 *   bar lengths with other terms) is that meter's own: its clips fail and the
 *   rest go on. It still refuses the call when every meter fails, or when a
 *   failing meter holds a `strict` clip (one a cut or an overwrite can't undo).
 * @param groups - The distinct meters, by key, each saying whether it is strict
 * @param read - Reads the transform for one meter; throws when it can't
 * @returns The failure of each meter that failed, by key
 * @throws The first failure, when it refuses the call
 */
export function failuresByMeter<G extends { strict: boolean }>(
  groups: Map<string, G>,
  read: (group: G) => void,
): Map<string, unknown> {
  const failed = new Map<string, unknown>();

  for (const [key, group] of groups) {
    try {
      read(group);
    } catch (error) {
      if (error instanceof TransformArgError) {
        throw error;
      }

      failed.set(key, error);
    }
  }

  const refuses =
    failed.size === groups.size ||
    [...failed.keys()].some((key) => groups.get(key)?.strict === true);

  if (failed.size > 0 && refuses) {
    throw [...failed.values()][0];
  }

  return failed;
}
