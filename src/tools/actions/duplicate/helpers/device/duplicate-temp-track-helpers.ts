// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Live has no duplicate_device or duplicate_chain call. The way around it is to
// duplicate the whole track, take what you want off the copy, and delete it —
// which every caller here shares, so the track-index bookkeeping lives in one
// place.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  formatObjectPath,
  parseObjectPath,
} from "#src/tools/shared/validation/object-path.ts";

/** What a caller gets to work with while the temp track exists. */
export interface TempTrackCopy {
  /** Where the temp track landed */
  tempTrackIndex: number;
  /** The source's own track index, before the copy shifted anything */
  sourceTrackIndex: number;
  /** The same in-track path as the source, but on the temp track */
  tempPath: string;
}

/**
 * Duplicate the track holding `sourcePath`, hand the copy to `body`, and delete
 * it however `body` ends. Everything after the track prefix is carried over
 * unchanged, so `tempPath` names the same object on the copy.
 * @param sourcePath - Live API path of the object being copied
 * @param what - Singular noun for what is being copied ("device"), for errors
 * @param body - Runs while the temp track exists
 * @returns Whatever body returns
 */
export function withTempTrackCopy<T>(
  sourcePath: string,
  what: string,
  body: (copy: TempTrackCopy) => T,
): T {
  const sourceTrackIndex = extractRegularTrackIndex(sourcePath);

  if (sourceTrackIndex == null) {
    throw new Error(
      `duplicate failed: cannot duplicate ${what}s on return/master tracks`,
    );
  }

  const withinTrack = extractPathWithinTrack(sourcePath, what);
  const liveSet = LiveAPI.from(livePath.liveSet);

  liveSet.call("duplicate_track", sourceTrackIndex);

  const tempTrackIndex = sourceTrackIndex + 1;

  // From here a full copy of the source track — devices, clips and all — is
  // parked at tempTrackIndex, so every exit deletes it. Anything that throws in
  // between (a bad destination path, an unreachable chain) used to strand it.
  try {
    return body({
      tempTrackIndex,
      sourceTrackIndex,
      tempPath: `${livePath.track(tempTrackIndex)} ${withinTrack}`,
    });
  } finally {
    // Moving a device creates and deletes no tracks, so the temp track is still
    // where duplicate_track put it.
    liveSet.call("delete_track", tempTrackIndex);
  }
}

/**
 * The regular track index a Live path starts with
 * @param path - Live API path
 * @returns Track index, or null for a return/master track
 */
export function extractRegularTrackIndex(path: string): number | null {
  const match = path.match(/^live_set tracks (\d+)/);

  return match ? Number.parseInt(match[1] as string) : null;
}

/**
 * Everything after the track prefix, e.g. "devices 0 chains 2 devices 1"
 * @param path - Full Live API path
 * @param what - Singular noun for what is being copied, for the error
 * @returns The path within its track
 */
export function extractPathWithinTrack(path: string, what: string): string {
  const match = path.match(
    /^live_set (?:tracks \d+|return_tracks \d+|master_track) (.+)$/,
  );

  if (!match) {
    throw new Error(
      `duplicate failed: cannot extract ${what} path from "${path}"`,
    );
  }

  return match[1] as string;
}

/**
 * The canonical spelling of a path, or the path unchanged when it doesn't
 * parse — the mover reports the bad one as it warns and skips.
 * @param path - The destination path as the caller wrote it
 * @returns The canonical spelling
 */
export function canonicalPath(path: string): string {
  try {
    return formatObjectPath(parseObjectPath(path, "toPath"));
  } catch {
    return path;
  }
}

/**
 * Shift a destination past the temp track. Duplicating track N puts a new track
 * at N+1, so anything addressing a track after N is now one index further on.
 * @param toPath - Destination path
 * @param sourceTrackIndex - The duplicated track's index
 * @returns The adjusted path
 */
export function adjustTrackIndicesForTempTrack(
  toPath: string,
  sourceTrackIndex: number,
): string {
  const match = toPath.match(/^t(\d+)/);

  // Not a regular track path (return/master), so nothing shifted it.
  if (!match) {
    return toPath;
  }

  const destTrackIndex = Number.parseInt(match[1] as string);

  return destTrackIndex > sourceTrackIndex
    ? toPath.replace(/^t\d+/, `t${destTrackIndex + 1}`)
    : toPath;
}
