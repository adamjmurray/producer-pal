// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { refuseUnreadableNoteEdits } from "../notes/note-edit-refusal.ts";
import { type ClipRun } from "./clip-run.ts";
import { cutBlocker } from "./cut-clip.ts";
import { type ClipCall } from "./parse-clip-call.ts";
import { type ClipPayload } from "./resolve-clip-targets.ts";

/**
 * Refuse a call whose note edits can't be read, before anything is cut or
 * written. Each clip is read in the meter it will have, so a range that only
 * fits some meters isn't refused for the clips it fits.
 * @param call - The update-clip call
 * @param targets - The call's targets, in the order named
 * @param run - The call's shared state
 * @returns The call, checked
 * @throws Error when a note edit can't be read
 */
export function checkClipUpdate(
  call: ClipCall,
  targets: Array<Target<ClipPayload>>,
  run: ClipRun,
): ClipCall {
  const { args } = call;
  // A clip named twice is read once, as its last mention asks.
  const requestedIndexById = new Map<string, number>();
  const clips: LiveAPI[] = [];

  for (const [index, target] of targets.entries()) {
    if (target.skip == null) {
      requestedIndexById.set(target.data.clip.id, index);
    }
  }

  for (const [index, target] of targets.entries()) {
    if (
      target.skip == null &&
      requestedIndexById.get(target.data.clip.id) === index
    ) {
      clips.push(target.data.clip);
    }
  }

  refuseUnreadableNoteEdits({
    clips,
    noteEdits: {
      notationString: args.notes,
      transformString: args.transforms,
      preTransformString: args.preTransforms,
      context: run.context,
    },
    timeSignature: args.timeSignature,
    targetCount: call.named.length,
    requestedIndexById,
    splitting: call.split != null,
  });

  const { split } = call;

  // How many clips the cut is to measure, for what it says of the call as a
  // whole once every one has been.
  run.splitCount =
    split == null
      ? 0
      : clips.filter((clip) => cutBlocker(clip, split) == null).length;

  return call;
}
