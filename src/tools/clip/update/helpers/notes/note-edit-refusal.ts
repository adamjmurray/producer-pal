// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import {
  splitList,
  valueForIndex,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import { getTimeSignature } from "../clip-beat-positions.ts";
import { type NoteEdits, refuseNoteEditsByMeter } from "./note-edit-parsing.ts";

interface CallNoteEdits {
  clips: LiveAPI[];
  noteEdits: NoteEdits;
  /** Meter(s) the call sets, one per target */
  timeSignature: string | undefined;
  targetCount: number;
  /** Each clip's target, by clip id */
  requestedIndexById: Map<string, number>;
  /** Whether the call splits, which can't be undone */
  splitting: boolean;
}

/**
 * Refuse a call's note edits that can't be read, before anything is cut or
 * written. Each clip is read in the meter it will have, so a range that only
 * fits some meters isn't refused for the clips it fits. Only a clip the split
 * will cut refuses the whole call; any other is skipped on its own.
 * @param call - The clips, the note edits and how the call sets meters
 * @param call.clips - The clips the call will update
 * @param call.noteEdits - The call's notes and transforms
 * @param call.timeSignature - Meter(s) the call sets, one per target
 * @param call.targetCount - How many targets the call named
 * @param call.requestedIndexById - Each clip's target, by clip id
 * @param call.splitting - Whether the call splits
 * @returns Why each clip that can't read the edits in its own meter is to be
 *   skipped, by clip id
 */
export function refuseUnreadableNoteEdits({
  clips,
  noteEdits,
  timeSignature,
  targetCount,
  requestedIndexById,
  splitting,
}: CallNoteEdits): Map<string, string> {
  const list = splitList(timeSignature, targetCount, "timeSignature");

  return refuseNoteEditsByMeter(
    clips,
    noteEdits,
    (clip) =>
      getTimeSignature(
        valueForIndex(
          timeSignature,
          requestedIndexById.get(clip.id) as number,
          list,
        ),
        clip,
      ),
    (clip) =>
      splitting &&
      (clip.getProperty("is_arrangement_clip") as number) > 0 &&
      !isTakeLaneClip(clip),
  );
}
