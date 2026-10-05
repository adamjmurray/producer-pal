// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What one duplicate call keeps between its copies. Each LiveAPI is looked up
// once and shared, which is what keeps a long fan-out from rebuilding the
// source and the destination tracks per copy. It is built per call and dies
// with it: nothing here may be held past the request.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type SongMeter,
  songMeter,
} from "#src/tools/shared/validation/helpers/song-meter.ts";
import { copyLedger } from "../clip/overwrites/copy-overwrites.ts";
import {
  resolveSlotCopySource,
  type SlotCopySource,
} from "../clip/duplicate-clip-slot.ts";
import { readScene, type ScenePass } from "../sources/scene-clips.ts";
import { type DuplicateRun } from "./duplicate-call-types.ts";

/**
 * The state for one call.
 * @param context - The request's context, with the call's lane view on it
 * @returns An empty run
 */
export function newDuplicateRun(context: Partial<ToolContext>): DuplicateRun {
  return {
    context,
    // Reads each arrangement lane once, so every copy can say what it overwrote.
    ledger: copyLedger(context.lanes),
    lanes: new Map(),
    tracks: new Map(),
    objects: new Map(),
    slotSources: new Map(),
    takeLaneName: undefined,
    namesTakeLane: false,
    lastScene: new Map(),
    scenes: new Map(),
    meter: null,
    sources: [],
    clipDestinations: null,
    rerun: "copy",
  };
}

/**
 * An object the call copies, looked up once for the call.
 * @param run - The call's shared state
 * @param id - The object's id
 * @returns The object
 */
export function liveObject(run: DuplicateRun, id: string): LiveAPI {
  const known = run.objects.get(id);

  if (known != null) {
    return known;
  }

  const object = LiveAPI.from(id);

  run.objects.set(id, object);

  return object;
}

/**
 * A destination track, looked up once for the call.
 * @param run - The call's shared state
 * @param trackIndex - The track
 * @returns The track
 */
export function trackFor(run: DuplicateRun, trackIndex: number): LiveAPI {
  const known = run.tracks.get(trackIndex);

  if (known != null) {
    return known;
  }

  const track = LiveAPI.from(livePath.track(trackIndex));

  run.tracks.set(trackIndex, track);

  return track;
}

/**
 * What every copy of one session clip shares: the slot it reads from and the
 * tracks it writes to. Copying a clip into a slot moves neither.
 * @param run - The call's shared state
 * @param clip - The source clip, which sits in a clip slot
 * @param destinationTrackIndex - The track the copy goes to
 * @returns The source slot, its clip, and the call's destination tracks
 */
export function slotSourceFor(
  run: DuplicateRun,
  clip: LiveAPI,
  destinationTrackIndex: number,
): SlotCopySource {
  const known = run.slotSources.get(clip.id);

  trackFor(run, destinationTrackIndex);

  if (known != null) {
    return known;
  }

  const resolved = {
    ...resolveSlotCopySource(
      clip.trackIndex as number,
      clip.sceneIndex as number,
    ),
    tracks: run.tracks,
  };

  run.slotSources.set(clip.id, resolved);

  return resolved;
}

/**
 * The song time signature, read once for the call.
 * @param run - The call's shared state
 * @returns The song meter
 */
export function meterOf(run: DuplicateRun): SongMeter {
  run.meter ??= songMeter();

  return run.meter;
}

/**
 * A source scene's clips and length, read once for the call: copying a scene to
 * the arrangement moves none of them.
 * @param run - The call's shared state
 * @param sceneId - The scene's id
 * @returns The scene as read
 * @throws Error when there is no such scene
 */
export function scenePass(run: DuplicateRun, sceneId: string): ScenePass {
  const known = run.scenes.get(sceneId);

  if (known != null) {
    return known;
  }

  const read = readScene(sceneId);

  run.scenes.set(sceneId, read);

  return read;
}
