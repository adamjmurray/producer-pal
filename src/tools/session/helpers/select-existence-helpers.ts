// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Existence checks for what select was asked to select. Nothing bounds the
// index in a path or an index param, so "t99" is a well-formed request for a
// track that isn't there — and a selection that quietly doesn't happen reads to
// a model exactly like one that did.
//
// Checked up front, before any view switch or selection, so a failed select
// leaves Live untouched and the update helpers can assume their target is there.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { resolvePathToLiveApi } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import { buildTrackPath, type TrackCategory } from "./select-helpers.ts";

interface SelectTargets {
  trackId?: string;
  category: TrackCategory;
  trackIndex?: number;
  sceneId?: string;
  sceneIndex?: number;
  clipSlot?: { trackIndex: number; sceneIndex: number };
  devicePath?: string;
}

/**
 * Refuse a select naming something that isn't there. IDs are checked where
 * they're resolved, so this covers the path and index spellings.
 * @param targets - What the caller asked to select
 * @param targets.trackId - Track ID, when the track came from an ID
 * @param targets.category - Track category
 * @param targets.trackIndex - 0-based index within the category
 * @param targets.sceneId - Scene ID, when the scene came from an ID
 * @param targets.sceneIndex - 0-based scene index
 * @param targets.clipSlot - Session position coordinates
 * @param targets.devicePath - Device path, e.g. "t0/d1"
 */
export function requireSelectTargets({
  trackId,
  category,
  trackIndex,
  sceneId,
  sceneIndex,
  clipSlot,
  devicePath,
}: SelectTargets): void {
  const trackPath =
    trackId == null ? buildTrackPath(category, trackIndex) : null;

  if (trackPath != null) {
    requireTarget(
      LiveAPI.from(trackPath),
      "track",
      trackPathLabel(category, trackIndex),
    );
  }

  if (sceneId == null && sceneIndex != null) {
    requireTarget(
      LiveAPI.from(livePath.scene(sceneIndex)),
      "scene",
      `s${sceneIndex}`,
    );
  }

  if (clipSlot != null) requireClipSlot(clipSlot);

  if (devicePath != null) requireDevice(devicePath);
}

// --- Helpers below main exports ---

/**
 * The path spelling for a track target, so an index param is refused in the
 * same words as the path that replaced it.
 * @param category - Track category
 * @param trackIndex - 0-based index within the category
 * @returns The path spelling, e.g. "t2", "rt0", "mt"
 */
function trackPathLabel(category: TrackCategory, trackIndex?: number): string {
  if (category === "master") return "mt";

  return category === "return" ? `rt${trackIndex}` : `t${trackIndex}`;
}

/**
 * Refuse a target that isn't there, naming it the way the caller could ask for it.
 * @param api - The object the caller named
 * @param kind - What it was meant to be
 * @param path - The path spelling of the target
 */
function requireTarget(api: LiveAPI, kind: string, path: string): void {
  if (!api.exists()) {
    throw new Error(`select failed: no ${kind} at "${path}"`);
  }
}

/**
 * Refuse a session position, saying whether the track or the scene is missing.
 * @param slot - The clip slot coordinates
 * @param slot.trackIndex - 0-based track index
 * @param slot.sceneIndex - 0-based scene index
 */
function requireClipSlot({
  trackIndex,
  sceneIndex,
}: {
  trackIndex: number;
  sceneIndex: number;
}): void {
  requireTarget(
    LiveAPI.from(livePath.track(trackIndex)),
    "track",
    `t${trackIndex}`,
  );
  requireTarget(
    LiveAPI.from(livePath.scene(sceneIndex)),
    "scene",
    `s${sceneIndex}`,
  );
  requireTarget(
    LiveAPI.from(livePath.track(trackIndex).clipSlot(sceneIndex)),
    "clip slot",
    `t${trackIndex}/s${sceneIndex}`,
  );
}

/**
 * Refuse a device path pointing at nothing. A path naming a chain instead of a
 * device is left to the selection itself to reject.
 * @param devicePath - The device path, e.g. "t0/d1"
 */
function requireDevice(devicePath: string): void {
  const resolved = resolvePathToLiveApi(devicePath);

  if (resolved.targetType !== "device") return;

  requireTarget(LiveAPI.from(resolved.liveApiPath), "device", devicePath);
}
