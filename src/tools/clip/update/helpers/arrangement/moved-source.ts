// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { emptyTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lane-placeholder.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";

/**
 * Get the source out of the way once its copy has landed. Live can delete a
 * main-lane clip outright; a take-lane one can only be cleared in place, which
 * leaves a placeholder the user has to delete by hand.
 * @param clip - The source clip
 * @param sourceTrack - The track it sits on
 * @returns What a take lane kept, for the clip's entry to report, or null
 */
export function removeMovedSource(
  clip: LiveAPI,
  sourceTrack: LiveAPI,
): string | null {
  if (isTakeLaneClip(clip)) {
    return emptyTakeLaneClip(clip);
  }

  sourceTrack.call("delete_clip", toLiveApiId(clip.id));

  return null;
}
