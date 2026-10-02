// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { type MinimalClipInfo } from "../minimal-clip-info.ts";

/** A track or scene copy's entry, as it was when its clips were read. */
export interface CopyEntry {
  id: string;
  path: string;
  clips: MinimalClipInfo[];
}

/** The part of a clip path that holds the track or scene index. */
const CLIP_INDEX = {
  track: /^(t)(\d+)/,
  scene: /(\/s)(\d+)$/,
};

/**
 * Re-read where each copy sits, and move its clips along with it. A copy made
 * later can land ahead of earlier ones, so paths read as each copy landed go
 * stale.
 * @param entries - The copies' entries, updated in place
 * @param kind - Whether the copies are tracks or scenes
 */
export function settleCopyPaths(
  entries: CopyEntry[],
  kind: "track" | "scene",
): void {
  for (const entry of entries) {
    const object = LiveAPI.from(entry.id);
    const index = kind === "track" ? object.trackIndex : object.sceneIndex;

    if (index == null) {
      continue;
    }

    // A group's clips sit on its members, so shift each by the group's move.
    const shift = index - Number(entry.path.slice(1));

    entry.path =
      kind === "track"
        ? formatObjectPath({ kind, trackIndex: index })
        : formatObjectPath({ kind, sceneIndex: index });

    for (const clip of entry.clips) {
      if (clip.path != null) {
        clip.path = clip.path.replace(
          CLIP_INDEX[kind],
          (_, prefix: string, n: string) => `${prefix}${Number(n) + shift}`,
        );
      }
    }
  }
}
