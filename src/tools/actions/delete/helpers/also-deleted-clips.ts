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
  const listed = clipsListed(
    clips,
    `${holder === "scene" ? "in" : "on"} this ${holder}`,
  );

  return listed == null ? undefined : `also deleted ${listed}`;
}

/**
 * Count and name clips, up to the first 10.
 * @param clips - The clips, as they were before the delete
 * @param where - What held them: "on this track", "on them"
 * @returns `the 3 clips on them: ...`, or undefined when there were none
 */
export function clipsListed(
  clips: ListedClip[],
  where: string,
): string | undefined {
  const [only, ...rest] = clips;

  if (only == null) {
    return undefined;
  }

  if (rest.length === 0) {
    return `the clip ${where}: ${clipText(only)}`;
  }

  const shown = clips.slice(0, MAX_LISTED).map(clipText).join(", ");
  const more =
    clips.length > MAX_LISTED ? `, and ${clips.length - MAX_LISTED} more` : "";

  return `the ${clips.length} clips ${where}: ${shown}${more}`;
}

// The path, and the name when the clip has one. Only a clip that is shown gets
// its name read.
function clipText({ path, clip }: ListedClip): string {
  const name = clip.getProperty("name");

  return typeof name !== "string" || name === ""
    ? path
    : `${path} ${JSON.stringify(name)}`;
}
