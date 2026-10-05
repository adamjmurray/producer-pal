// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  appendDetail,
  joinDetails,
} from "#src/tools/shared/helpers/entry-details.ts";
import {
  landedColor,
  type LandedColor,
} from "#src/tools/shared/helpers/landed-color.ts";
import { namedParam } from "#src/tools/shared/helpers/param-presence.ts";
import {
  newTargetNotes,
  noteTarget,
  type TargetNotes,
} from "#src/tools/shared/helpers/target-notes.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  getMinimalClipInfo,
  type MinimalClipInfo,
} from "../minimal-clip-info.ts";
import { configureRouting } from "./duplicate-routing.ts";
import { landTrackCopy } from "./landed-track-copy.ts";
import { removeHostTrackDevice } from "../device/remove-host-track-device.ts";

/** One track copy's entry in the result. */
export interface TrackCopyEntry {
  id: string;
  path: string;
  /** The color Live settled on, when it isn't the one asked for */
  color?: string;
  clips: MinimalClipInfo[];
  detail?: string;
}

/**
 * Delete all devices from a track
 * @param newTrack - The track LiveAPI object
 */
function deleteAllDevices(newTrack: LiveAPI): void {
  // Delete from the end backwards to avoid index shifting
  const deviceCount = newTrack.getChildIds("devices").length;

  for (let i = deviceCount - 1; i >= 0; i--) {
    newTrack.call("delete_device", i);
  }
}

/**
 * Collect or delete clips from a duplicated track
 * @param newTrack - The new track LiveAPI object
 * @param withoutClips - Whether to delete clips instead of collecting them
 * @returns Array of clip info objects
 */
function processClipsForDuplication(
  newTrack: LiveAPI,
  withoutClips: boolean | undefined,
): MinimalClipInfo[] {
  const duplicatedClips: MinimalClipInfo[] = [];

  if (withoutClips === true) {
    deleteSessionClips(newTrack);
    deleteArrangementClips(newTrack);
  } else {
    collectSessionClips(newTrack, duplicatedClips);
    collectArrangementClips(newTrack, duplicatedClips);
  }

  return duplicatedClips;
}

/**
 * Delete all session clips from a track
 * @param newTrack - The track LiveAPI object
 */
function deleteSessionClips(newTrack: LiveAPI): void {
  const sessionClipSlotIds = newTrack.getChildIds("clip_slots");

  for (const clipSlotId of sessionClipSlotIds) {
    const clipSlot = LiveAPI.from(clipSlotId);

    if (clipSlot.getProperty("has_clip")) {
      clipSlot.call("delete_clip");
    }
  }
}

/**
 * Delete all arrangement clips from a track
 * @param newTrack - The track LiveAPI object
 */
function deleteArrangementClips(newTrack: LiveAPI): void {
  const arrangementClipIds = newTrack.getChildIds("arrangement_clips");

  for (const clipId of arrangementClipIds) {
    newTrack.call("delete_clip", clipId);
  }
}

/**
 * Collect info about session clips in a track
 * @param newTrack - The track LiveAPI object
 * @param duplicatedClips - Array to append clip info to
 */
function collectSessionClips(
  newTrack: LiveAPI,
  duplicatedClips: MinimalClipInfo[],
): void {
  const sessionClipSlotIds = newTrack.getChildIds("clip_slots");

  for (const clipSlotId of sessionClipSlotIds) {
    const clipSlot = LiveAPI.from(clipSlotId);

    if (clipSlot.getProperty("has_clip")) {
      const clip = clipSlot.child("clip");

      duplicatedClips.push(getMinimalClipInfo(clip));
    }
  }
}

/**
 * Collect info about arrangement clips in a track
 * @param newTrack - The track LiveAPI object
 * @param duplicatedClips - Array to append clip info to
 */
function collectArrangementClips(
  newTrack: LiveAPI,
  duplicatedClips: MinimalClipInfo[],
): void {
  const arrangementClipIds = newTrack.getChildIds("arrangement_clips");

  for (const clipId of arrangementClipIds) {
    const clip = LiveAPI.from(clipId);

    if (clip.exists()) {
      duplicatedClips.push(getMinimalClipInfo(clip));
    }
  }
}

/** What every copy of a track leaves out, and whether it feeds the source. */
export interface TrackCopyOptions {
  withoutClips?: boolean;
  withoutDevices?: boolean;
  routeToSource?: boolean;
}

/** The name and color one copy gets. */
export interface TrackCopyLabel {
  name?: string;
  color?: string;
}

/**
 * The source's regular track index.
 * @param object - The source track
 * @returns Its index
 * @throws Error for a return or main track, which Live can't duplicate
 */
export function regularTrackIndex(object: LiveAPI): number {
  const trackIndex = object.trackIndex;

  if (trackIndex == null) {
    throw new Error(
      `${targetLabel(object)} is not a regular track, and Live only duplicates those`,
    );
  }

  return trackIndex;
}

/**
 * Make one copy of a track, from the source itself, and name and color it. The
 * copy is told to `landed` the moment it exists, so a throw after that keeps it
 * on its entry. Routing waits until every copy exists: it changes the source's
 * input, and a copy made after that would inherit it.
 * @param trackIndex - The source track
 * @param label - The copy's name and color
 * @param options - What the copy leaves out
 * @param landed - Told what has changed Live, as it does
 * @returns The copy's entry
 * @throws Error when Live made no copy
 */
export function duplicateTrackCopy(
  trackIndex: number,
  label: TrackCopyLabel,
  options: TrackCopyOptions,
  landed: (phrase: string, partial: Record<string, unknown>) => void,
): TrackCopyEntry {
  const notes = newTargetNotes();
  const copy = makeTrackCopy(trackIndex, options, notes);
  const path = formatObjectPath({ kind: "track", trackIndex: copy.index });

  landed("copy made", { id: copy.track.id, path, clips: copy.clips });

  const color = nameAndColor(copy.track, label, notes);
  const detail = joinDetails(notes.said);

  return {
    id: copy.track.id,
    // Where its clips were read; settleCopyPaths moves both along.
    path,
    ...(color.color == null ? {} : { color: color.color }),
    clips: copy.clips,
    ...(detail == null ? {} : { detail }),
  };
}

/**
 * Feed a track copy into its source: the source takes no input of its own and
 * the copy's output goes to it. A failure is on the copy's entry, since the
 * copy exists.
 * @param entry - The copy's entry, added to
 * @param copy - The copy
 * @param sourceTrackIndex - The source track
 */
export function routeTrackCopy(
  entry: { detail?: string },
  copy: LiveAPI,
  sourceTrackIndex: number,
): void {
  const notes = newTargetNotes();

  try {
    configureRouting(copy, sourceTrackIndex, notes);
  } catch (error) {
    noteTarget(
      notes,
      `the track was made, but routing didn't finish: ${errorMessage(error)}`,
    );
  }

  const detail = joinDetails(notes.said);

  if (detail != null) {
    appendDetail(entry, detail);
  }
}

// --- Helpers below main exports ---

/** A copy that exists but isn't labeled yet. */
interface MadeTrackCopy {
  track: LiveAPI;
  /** Where the copy was when its clips were read */
  index: number;
  clips: MinimalClipInfo[];
}

/**
 * Duplicate the source and strip the copy down to what the call keeps. Nothing
 * here touches the source, so the next copy starts from the same track.
 * @param trackIndex - The source track
 * @param options - What the copy leaves out
 * @param notes - What the copy's entry should say
 * @returns The copy, not yet labeled
 */
function makeTrackCopy(
  trackIndex: number,
  options: TrackCopyOptions,
  notes: TargetNotes,
): MadeTrackCopy {
  const landing = landTrackCopy(trackIndex);
  const clips: MinimalClipInfo[] = [];

  if (landing.threw != null) {
    noteTarget(notes, `the track was made, but Live said: ${landing.threw}`);
  }

  // The copy exists from here on, so a failure is on its entry: a throw would
  // report a skip for a track that is there.
  try {
    removeHostTrackDevice(trackIndex, landing, options.withoutDevices, notes);

    // A group's copy brings its members' copies, which get the same treatment.
    for (let offset = 0; offset < landing.added; offset++) {
      const copied = LiveAPI.from(livePath.track(landing.index + offset));

      if (options.withoutDevices === true) {
        deleteAllDevices(copied);
      }

      clips.push(...processClipsForDuplication(copied, options.withoutClips));
    }
  } catch (error) {
    noteTarget(
      notes,
      `the track was made, but setting it up failed: ${errorMessage(error)}`,
    );
  }

  const track = LiveAPI.from(livePath.track(landing.index));

  return { track, index: landing.index, clips };
}

/**
 * Name and color a copy that exists.
 * @param track - The copy
 * @param label - Its name and color
 * @param notes - What the copy's entry should say
 * @returns The color Live settled on, when it isn't the one asked for
 */
function nameAndColor(
  track: LiveAPI,
  label: TrackCopyLabel,
  notes: TargetNotes,
): LandedColor {
  let landed: LandedColor = {};

  // The copy exists, so a failure here is on its entry rather than a throw that
  // would drop every copy the call made.
  try {
    if (label.name != null) {
      track.set("name", label.name);
    }

    if (label.color != null) {
      track.setColor(label.color);
      landed = landedColor(track, label.color);
    }
  } catch (error) {
    noteTarget(
      notes,
      `the track was made, but naming or coloring it didn't finish: ${errorMessage(error)}`,
    );
  }

  if (landed.detail != null) {
    noteTarget(notes, landed.detail);
  }

  return landed;
}

/**
 * Says on each track copy's entry that its toPath wasn't honored: Live only
 * puts a copy right after its source, or after a group's last member, and
 * each entry's path says where it went.
 * @param entries - One entry per track copy
 * @param rawToPath - The toPath the call sent
 */
export function noteUnhonoredTrackToPath(
  entries: object[],
  rawToPath: string | undefined,
): void {
  const toPath = namedParam(rawToPath, "toPath");

  if (toPath == null) {
    return;
  }

  // A failed copy landed nowhere.
  for (const entry of entries.filter((each) => !("ok" in each))) {
    appendDetail(
      entry,
      `toPath "${toPath}" not honored; a track copy lands right after its source, or after a group's last member`,
    );
  }
}
