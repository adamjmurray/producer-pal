// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { refuseUnreadableCopyTransforms } from "../clip/apply-clip-transforms.ts";
import {
  refuseClipOverwrites,
  refusePadOverwrites,
} from "../sources/source-overwrites.ts";
import {
  type DuplicateCall,
  type DuplicateRun,
  type DuplicateTarget,
} from "./duplicate-call-types.ts";

/**
 * Refuse what can't be carried out as asked, before the first copy is made. A
 * copy that would land on a later source of the call would wreck that source's
 * own turn, and transforms the copies can't read would fail after the clips
 * they apply to were made.
 * @param parsed - The call, as read
 * @param targets - The call's copies
 * @param run - The call's shared state
 * @returns The call, for the writes
 * @throws Error when the call can't be carried out as asked
 */
export function checkDuplicateCall(
  parsed: DuplicateCall,
  targets: DuplicateTarget[],
  run: DuplicateRun,
): DuplicateCall {
  const { type } = parsed;
  // Nothing can be copied from a skipped source, so nothing about it is read.
  const sources = run.sources.filter(({ skip }) => skip == null);

  refuseUnreadableCopyTransforms(type, sources, parsed.args.transforms);

  if (type === "clip") {
    refuseClipOverwrites(targets, run.sources);
  } else if (type === "drum-pad") {
    refusePadOverwrites(sources);
  }

  return parsed;
}
