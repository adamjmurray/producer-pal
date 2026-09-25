// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/get-host-track-index.ts";
import {
  appendReason,
  joinReasons,
} from "#src/tools/shared/helpers/entry-reasons.ts";
import { namedParam } from "#src/tools/shared/helpers/param-presence.ts";
import {
  newTargetNotes,
  noteTarget,
  type TargetNotes,
} from "#src/tools/shared/helpers/target-notes.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import {
  getMinimalClipInfo,
  type MinimalClipInfo,
} from "../minimal-clip-info.ts";
import { configureRouting } from "../duplicate-routing.ts";
import { type LandedTrackCopy, landTrackCopy } from "./landed-track-copy.ts";

/** One track copy's entry in the result. */
export interface TrackCopyEntry {
  id: string;
  path: string;
  clips: MinimalClipInfo[];
  reason?: string;
}

/**
 * Remove the Producer Pal device from the copy of its host track. A group's
 * copy holds copies of its members right after it, in the same order, so the
 * host may be one of those.
 * @param trackIndex - The source track
 * @param landing - Where the copy landed
 * @param withoutDevices - Whether devices were excluded
 * @param notes - What the copy's entry should say
 */
function removeHostTrackDevice(
  trackIndex: number,
  landing: LandedTrackCopy,
  withoutDevices: boolean | undefined,
  notes: TargetNotes,
): void {
  const hostTrackIndex = getHostTrackIndex();

  if (hostTrackIndex == null || withoutDevices === true) {
    return;
  }

  const offset = hostTrackIndex - trackIndex;

  if (offset < 0 || offset >= landing.added) {
    return;
  }

  try {
    const thisDevice = LiveAPI.from("this_device");
    const thisDevicePath = thisDevice.path;

    // Extract device index from path like "live_set tracks 1 devices 0"
    const deviceIndexMatch = thisDevicePath.match(/devices (\d+)/);

    if (deviceIndexMatch) {
      LiveAPI.from(livePath.track(landing.index + offset)).call(
        "delete_device",
        Number.parseInt(deviceIndexMatch[1] ?? ""),
      );
      noteTarget(notes, "the Producer Pal device was not copied");
    }
  } catch {
    // this_device is unreadable, so nothing was removed either way.
    noteTarget(
      notes,
      "could not check the new track for the Producer Pal device",
    );
  }
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

/** A copy that exists but isn't labeled or routed yet. */
interface MadeTrackCopy {
  track: LiveAPI;
  /** Where the copy was when its clips were read */
  index: number;
  clips: MinimalClipInfo[];
  notes: TargetNotes;
}

/**
 * Make up to `count` copies of a track, every one from the source itself.
 * Labels and routing go on only once all copies exist: routing changes the
 * source's input, and a copy made after that would inherit it.
 * @param trackIndex - The source track
 * @param count - How many copies to make
 * @param labelFor - Name and color for the nth copy, in Set order
 * @param options - What every copy leaves out, and whether it feeds the source
 * @param shouldStop - Asked before each copy with how many exist; true stops
 * @returns One entry per copy made, in Set order
 */
export function duplicateTrackCopies(
  trackIndex: number,
  count: number,
  labelFor: (index: number) => TrackCopyLabel,
  options: TrackCopyOptions,
  shouldStop: (made: number) => boolean = () => false,
): TrackCopyEntry[] {
  const made: MadeTrackCopy[] = [];
  let entries: TrackCopyEntry[];

  try {
    for (let i = 0; i < count; i++) {
      if (shouldStop(made.length)) {
        break;
      }

      made.push(makeTrackCopy(trackIndex, options));
    }
  } finally {
    // Runs on a failed copy too, so the ones made before it still get finished.
    // Each copy lands ahead of the ones made before it, so the last one made
    // comes first in the Set, and gets the first label.
    entries = made
      .toReversed()
      .map((copy, index) =>
        finishTrackCopy(
          copy,
          trackIndex,
          labelFor(index),
          options.routeToSource,
        ),
      );
  }

  settleTrackCopyPaths(entries);

  return entries;
}

/**
 * Duplicate the source and strip the copy down to what the call keeps. Nothing
 * here touches the source, so the next copy starts from the same track.
 * @param trackIndex - The source track
 * @param options - What the copy leaves out
 * @returns The copy, not yet labeled or routed
 */
function makeTrackCopy(
  trackIndex: number,
  options: TrackCopyOptions,
): MadeTrackCopy {
  const notes = newTargetNotes();
  const landing = landTrackCopy(trackIndex);
  const clips: MinimalClipInfo[] = [];

  removeHostTrackDevice(trackIndex, landing, options.withoutDevices, notes);

  // A group's copy brings its members' copies, which get the same treatment.
  for (let offset = 0; offset < landing.added; offset++) {
    const copied = LiveAPI.from(livePath.track(landing.index + offset));

    if (options.withoutDevices === true) {
      deleteAllDevices(copied);
    }

    clips.push(...processClipsForDuplication(copied, options.withoutClips));
  }

  const track = LiveAPI.from(livePath.track(landing.index));

  return { track, index: landing.index, clips, notes };
}

/**
 * Name, color and route one copy, and build its entry.
 * @param copy - The copy, made along with all the others
 * @param sourceTrackIndex - The source track, for routing
 * @param label - The copy's name and color
 * @param routeToSource - Whether the copy feeds the source
 * @returns The copy's entry
 */
function finishTrackCopy(
  copy: MadeTrackCopy,
  sourceTrackIndex: number,
  label: TrackCopyLabel,
  routeToSource: boolean | undefined,
): TrackCopyEntry {
  const { track, notes } = copy;

  if (label.name != null) {
    track.set("name", label.name);
  }

  if (label.color != null) {
    track.setColor(label.color);
  }

  if (routeToSource) {
    configureRouting(track, sourceTrackIndex, notes);
  }

  const reason = joinReasons(notes.said);

  return {
    id: track.id,
    // Where its clips were read; settleTrackCopyPaths moves both along.
    path: formatObjectPath({ kind: "track", trackIndex: copy.index }),
    clips: copy.clips,
    ...(reason == null ? {} : { reason }),
  };
}

/**
 * Re-read where each copy sits, and move its clips along with it. A copy made
 * later lands ahead of earlier ones, and a later source's copies can push an
 * earlier source's along, so paths read as each copy landed go stale.
 * @param entries - The copies' entries, updated in place
 */
export function settleTrackCopyPaths(entries: TrackCopyEntry[]): void {
  for (const entry of entries) {
    const trackIndex = LiveAPI.from(entry.id).trackIndex;

    if (trackIndex == null) {
      continue;
    }

    // A group's clips sit on its members, so shift each by the group's move.
    const shift = trackIndex - Number(entry.path.slice(1));

    entry.path = formatObjectPath({ kind: "track", trackIndex });

    for (const clip of entry.clips) {
      if (clip.path != null) {
        clip.path = clip.path.replace(
          /^t(\d+)/,
          (_, n: string) => `t${Number(n) + shift}`,
        );
      }
    }
  }
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

  for (const entry of entries) {
    appendReason(
      entry,
      `toPath "${toPath}" not honored; a track copy lands right after its source, or after a group's last member`,
    );
  }
}
