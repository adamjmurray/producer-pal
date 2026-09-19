// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Actually removing an object, once the delete tool has resolved and ordered
// its targets. One function per type, behind a dispatch on the tool-level type.
//
// Anything that stops a delete comes back as the reason it didn't happen, for
// the target's own result entry to carry.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
import {
  drumRackOfPad,
  invalidateRackChains,
} from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { deleteDrumChain } from "./delete-drum-chain.ts";
import { deleteTrackObject } from "./delete-track-object.ts";

/**
 * Deletes an object based on its type
 * @param type - The type of object ("track", "scene", "clip", "device", "drum-pad", or "chain")
 * @param id - The object ID
 * @param object - The object to delete
 * @param tracks - Tracks already resolved this call, keyed by index
 * @returns null if deleted, else why it wasn't
 */
export function deleteObjectByType(
  type: string,
  id: string,
  object: LiveAPI,
  tracks: Map<number, LiveAPI>,
): string | null {
  // Tracks have their own check below, by index — it names the track, which is
  // what the user asked for. Everything else routes through here.
  if (type !== "track" && isProducerPalDevice(object)) {
    return `cannot delete the Producer Pal device ${targetLabel(object)} (it is running this tool)`;
  }

  if (type === "track") {
    return deleteTrackObject(id, object, confirmDeleted);
  }

  if (type === "scene") {
    return deleteSceneObject(id, object);
  }

  if (type === "clip") {
    return deleteClipObject(id, object, tracks);
  }

  if (type === "device") {
    return deleteDeviceObject(id, object);
  }

  if (type === "drum-pad") {
    return deleteDrumPadObject(object);
  }

  return deleteDrumChain(id, object);
}

/**
 * Confirms a delete landed. Live refuses some of them without saying so — the
 * call returns the same thing either way — so whether the object is still there
 * is the only signal.
 *
 * Look the id up again rather than asking the object the delete ran through:
 * measured on 12.4.3, that one still reports its old id and path afterward. A
 * fresh lookup of a dead id lands nowhere and reads id "0".
 *
 * @param type - The tool-level type, for the reason
 * @param id - The object ID
 * @returns null if the object is gone, else why it survived
 */
function confirmDeleted(type: string, id: string): string | null {
  const survivor = LiveAPI.from(id);

  if (survivor.exists()) {
    return `${type} ${targetLabel(survivor)} still exists, so Live did not delete it`;
  }

  return null;
}

/**
 * Deletes a scene by its index
 * @param id - The object ID
 * @param object - The object to delete
 * @returns null if the scene is gone, else why it wasn't deleted
 */
function deleteSceneObject(id: string, object: LiveAPI): string | null {
  const sceneIndex = Number(object.path.match(/live_set scenes (\d+)/)?.[1]);

  if (Number.isNaN(sceneIndex)) {
    return `no scene index for ${targetLabel(object)} (Live path "${object.path}")`;
  }

  const liveSet = LiveAPI.from(livePath.liveSet);

  liveSet.call("delete_scene", sceneIndex);

  return confirmDeleted("scene", id);
}

/**
 * Deletes a clip by its track and clip ID
 * @param id - The object ID
 * @param object - The object to delete
 * @param tracks - Tracks already resolved this call, keyed by index
 * @returns null if the clip is gone, else why it wasn't deleted
 */
function deleteClipObject(
  id: string,
  object: LiveAPI,
  tracks: Map<number, LiveAPI>,
): string | null {
  // Take-lane clips cannot be removed via the API (delete_clip is a no-op for
  // them and there is no delete_take_lane) — the user must delete in Live's UI.
  if (isTakeLaneClip(object)) {
    return `cannot delete take-lane clip ${targetLabel(object)} via the API; remove it in Live's UI`;
  }

  const trackIndex = object.path.match(/live_set tracks (\d+)/)?.[1];

  if (!trackIndex) {
    return `no track index for ${targetLabel(object)} (Live path "${object.path}")`;
  }

  const track = trackAt(tracks, Number(trackIndex));

  track.call("delete_clip", toLiveApiId(object.id));

  return confirmDeleted("clip", id);
}

/**
 * Deletes a device by its ID via the parent (track or chain)
 * @param id - The object ID
 * @param object - The object to delete
 * @returns null if the device is gone, else why it wasn't deleted
 */
function deleteDeviceObject(id: string, object: LiveAPI): string | null {
  // Find the LAST "devices X" in the path to handle nested devices
  // e.g., "live_set tracks 1 devices 0 chains 0 devices 1" -> last match is "devices 1"
  const deviceMatches = [...object.path.matchAll(/devices (\d+)/g)];

  if (deviceMatches.length === 0) {
    return `no device index for ${targetLabel(object)} (Live path "${object.path}")`;
  }

  // We know deviceMatches has at least one element from the check above
  const lastMatch = deviceMatches.at(-1) as RegExpExecArray;
  const deviceIndex = Number(lastMatch[1]);

  // Parent path is everything before the last "devices X"
  const parentPath = object.path.substring(0, lastMatch.index).trim();

  if (!parentPath) {
    return `no parent path for device ${targetLabel(object)} (Live path "${object.path}")`;
  }

  const parent = LiveAPI.from(parentPath);

  parent.call("delete_device", deviceIndex);

  return confirmDeleted("device", id);
}

/**
 * Deletes (clears) a drum pad by removing all its chains
 * @param object - The object to delete
 * @returns null if the pad's chains are gone, else why some survived
 */
function deleteDrumPadObject(object: LiveAPI): string | null {
  const rack = drumRackOfPad(object);

  object.call("delete_all_chains");
  invalidateRackChains(rack);

  // The pad outlives its own delete, so there is no dead object to test for.
  // Read the chains back instead: a refused clear is otherwise indistinguishable
  // from a successful one.
  if (object.getChildCount("chains") > 0) {
    return `drum pad ${targetLabel(object)} still has chains, so Live did not clear it`;
  }

  return null;
}

/**
 * The track at an index, resolved once per call.
 * @param tracks - Tracks already resolved this call, keyed by index
 * @param trackIndex - The track's index
 * @returns The track
 */
function trackAt(tracks: Map<number, LiveAPI>, trackIndex: number): LiveAPI {
  const known = tracks.get(trackIndex);

  if (known != null) {
    return known;
  }

  const track = LiveAPI.from(livePath.track(trackIndex));

  tracks.set(trackIndex, track);

  return track;
}
