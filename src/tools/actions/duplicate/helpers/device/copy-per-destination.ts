// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// One entry per destination a device, chain or drum-pad copy named: the copy
// that landed, or why none did (ADR-0042).

import {
  attemptTarget,
  type NamedTarget,
  type TargetSkip,
} from "#src/tools/shared/validation/lists/named-targets.ts";

/**
 * Copies to every destination toPath named, keeping each one's slot.
 * @param paths - The destinations, as the caller spelled them in toPath
 * @param source - The source, as the caller named it
 * @param copyOne - Makes the copy for one destination, throwing when it can't
 * @returns One entry per destination, in the order toPath named them
 */
export function copyPerDestination<T>(
  paths: string[],
  source: NamedTarget,
  copyOne: (destination: string | undefined, index: number) => T,
): Array<T | TargetSkip> {
  // Nothing named a destination — a chain or device appending to its own rack —
  // so a refusal is addressed by the source the caller did name.
  if (paths.length === 0) {
    return [attemptTarget(source, () => copyOne(undefined, 0))];
  }

  return paths.map((path, index) =>
    attemptTarget({ param: "path", value: path }, () => copyOne(path, index)),
  );
}
