// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-paths.ts";

/** An empty clip slot to build a clip in before copying it where it goes. */
export interface ScratchSlot {
  slot: LiveAPI;
  path: string;
}

/**
 * Run `use` with an empty slot on the destination's track. A slot on the same
 * track always takes the clip type the destination does. When the track has
 * no empty slot, a scene is appended for the call and deleted afterwards,
 * along with anything left in it.
 * @param trackIndex - The destination's track
 * @param destSceneIndex - The destination's scene, never handed out
 * @param use - What to do with the empty slot
 * @returns Whatever `use` returns
 */
export function withScratchSlot<T>(
  trackIndex: number,
  destSceneIndex: number,
  use: (scratch: ScratchSlot) => T,
): T {
  const found = findEmptySlot(trackIndex, destSceneIndex);

  if (found != null) {
    return use(found);
  }

  const liveSet = LiveAPI.from(livePath.liveSet);
  const tempSceneIndex = liveSet.getChildIds("scenes").length;

  liveSet.call("create_scene", -1);

  try {
    return use({
      slot: LiveAPI.from(livePath.track(trackIndex).clipSlot(tempSceneIndex)),
      path: slotPath(trackIndex, tempSceneIndex),
    });
  } finally {
    liveSet.call("delete_scene", tempSceneIndex);
  }
}

// --- Helpers below main exports ---

/**
 * An empty slot on the track other than the destination's.
 * @param trackIndex - The track to search
 * @param destSceneIndex - The destination's scene, skipped
 * @returns The empty slot, or null when the track has none to spare
 */
function findEmptySlot(
  trackIndex: number,
  destSceneIndex: number,
): ScratchSlot | null {
  const track = LiveAPI.from(livePath.track(trackIndex));
  const sceneCount = track.getChildCount("clip_slots");

  for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex++) {
    if (sceneIndex === destSceneIndex) {
      continue;
    }

    const slot = LiveAPI.from(livePath.track(trackIndex).clipSlot(sceneIndex));

    if (!slot.getProperty("has_clip")) {
      return { slot, path: slotPath(trackIndex, sceneIndex) };
    }
  }

  return null;
}
