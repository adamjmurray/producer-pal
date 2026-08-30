// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { slotPath } from "#src/tools/shared/validation/object-path-helpers.ts";

export interface MidiNote {
  pitch: number;
  start_time: number;
  duration: number;
  velocity: number;
}

export interface NoteUpdateResult {
  noteCount: number;
  transformed?: number;
}

export interface ClipResult {
  id: string;
  noteCount?: number;
  transformed?: number;
  /** Where the clip is, as a path. Pastes back into any path/toPath param. */
  path?: string;
}

/**
 * Build clip result object with optional note stats. The caller passes the
 * path, read off a clip it already holds — resolving the id here would cost a
 * LiveAPI build per clip returned.
 * @param clipId - The clip ID
 * @param noteResult - Optional note update result with count and transformed
 * @param path - Where the clip is, from objectPathForApi
 * @returns Result object with id, path, and optionally noteCount/transformed
 */
export function buildClipResultObject(
  clipId: string,
  noteResult: NoteUpdateResult | null,
  path?: string,
): ClipResult {
  const result: ClipResult = { id: clipId };

  if (noteResult != null) {
    result.noteCount = noteResult.noteCount;

    if (noteResult.transformed != null) {
      result.transformed = noteResult.transformed;
    }
  }

  if (path != null) result.path = path;

  return result;
}

/**
 * Prepare a session clip slot, auto-creating scenes if needed
 * @param trackIndex - Track index (0-based)
 * @param sceneIndex - Target scene index (0-based)
 * @param liveSet - LiveAPI liveSet object
 * @param maxAutoCreatedScenes - Maximum number of scenes allowed
 * @returns The clip slot ready for clip creation
 */
export function prepareSessionClipSlot(
  trackIndex: number,
  sceneIndex: number,
  liveSet: LiveAPI,
  maxAutoCreatedScenes: number,
): LiveAPI {
  if (sceneIndex >= maxAutoCreatedScenes) {
    throw new Error(
      `scene "s${sceneIndex}" is out of range: scenes auto-create only through "s${maxAutoCreatedScenes - 1}"`,
    );
  }

  const currentSceneCount = liveSet.getChildIds("scenes").length;

  if (sceneIndex >= currentSceneCount) {
    const scenesToCreate = sceneIndex - currentSceneCount + 1;

    for (let j = 0; j < scenesToCreate; j++) {
      liveSet.call("create_scene", -1);
    }
  }

  const clipSlot = LiveAPI.from(
    livePath.track(trackIndex).clipSlot(sceneIndex),
  );

  if (clipSlot.getProperty("has_clip")) {
    throw new Error(
      `a clip already exists at ${slotPath(trackIndex, sceneIndex)}`,
    );
  }

  return clipSlot;
}

/**
 * The clip Live just put in the slot.
 *
 * Live declines a create it can't do — a MIDI clip on an audio track, say —
 * without raising, and a LiveAPI pointing at nothing reads back as id "0". Left
 * unchecked that ships as a successful create and poisons every follow-up call
 * that uses the id.
 * @param clipSlot - The slot the clip was created in
 * @param kind - Which clip was asked for
 * @returns The new clip
 * @throws When Live created nothing
 */
export function requireCreatedSessionClip(
  clipSlot: LiveAPI,
  kind: "MIDI" | "audio",
): LiveAPI {
  const clip = clipSlot.child("clip");

  if (!clip.exists()) {
    const needs =
      kind === "MIDI"
        ? "a MIDI clip needs a MIDI track"
        : "an audio clip needs an audio track";

    throw new Error(`Live created no clip - ${needs}`);
  }

  return clip;
}
