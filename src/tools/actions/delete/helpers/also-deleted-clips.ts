// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ListedClip } from "#src/tools/shared/clip/slot-contents/track-clips-listing.ts";

/** How many clips a delete entry names before it says how many more. */
const MAX_LISTED = 10;

/**
 * What a scene's or track's entry says about the clips that went with it.
 * @param clips - The clips it held, as they were before the delete
 * @param holder - What held them
 * @returns The detail, or undefined when there were none
 */
export function alsoDeletedClips(
  clips: ListedClip[],
  holder: "scene" | "track",
): string | undefined {
  const [only, ...rest] = clips;

  if (only == null) {
    return undefined;
  }

  const where = `${holder === "scene" ? "in" : "on"} this ${holder}`;

  if (rest.length === 0) {
    return `also deleted the clip ${where}: ${clipText(only)}`;
  }

  const shown = clips.slice(0, MAX_LISTED).map(clipText).join(", ");
  const more =
    clips.length > MAX_LISTED ? `, and ${clips.length - MAX_LISTED} more` : "";

  return `also deleted the ${clips.length} clips ${where}: ${shown}${more}`;
}

// The path, and the name when the clip has one. Only a clip that is shown gets
// its name read.
function clipText({ path, clip }: ListedClip): string {
  const name = clip.getProperty("name");

  return typeof name !== "string" || name === ""
    ? path
    : `${path} ${JSON.stringify(name)}`;
}
