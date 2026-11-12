// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { returnSlotPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type TargetSkip } from "#src/tools/shared/validation/lists/named-targets.ts";
import { type ReturnSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import { type MinimalClipInfo, skippedCopy } from "../../minimal-clip-info.ts";
import {
  copyIntoSlot,
  guardSlot,
  prepareDestinationSlot,
} from "./duplicate-clip-slot.ts";

/**
 * Copies an envelope clip into another return track's clip slot with Live's own
 * duplicate. The call has already refused every other kind of clip, and a Live
 * with no return-track clips.
 * @param clip - The envelope clip to copy
 * @param toSlot - The destination slot on a return track
 * @param name - Name for the copy, if any
 * @param color - Color for the copy, if any
 * @returns The copy, or the entry saying no copy landed there
 */
export function duplicateEnvelopeClip(
  clip: LiveAPI,
  toSlot: ReturnSlotPosition,
  name: string | undefined,
  color: string | undefined,
): MinimalClipInfo | TargetSkip {
  const destination = returnSlotPath(toSlot.returnIndex, toSlot.sceneIndex);

  return guardSlot(destination, (progress) => {
    // The call has already refused a destination on a return track that isn't
    // there, so no scene is made to reach one.
    const prepared = prepareDestinationSlot(toSlot);

    if (typeof prepared === "string") {
      return skippedCopy(destination, prepared);
    }

    progress.created = prepared.created;

    const sourceClipSlot = LiveAPI.from(
      livePath
        .returnTrack(clip.returnTrackIndex as number)
        .clipSlot(clip.returnClipSlotIndex as number),
    );

    return copyIntoSlot(sourceClipSlot, prepared, destination, progress, {
      name,
      color,
    });
  });
}
