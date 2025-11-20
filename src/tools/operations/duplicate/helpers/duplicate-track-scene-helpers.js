import { abletonBeatsToBarBeat } from "../../../notation/barbeat/time/barbeat-time.js";
import { getHostTrackIndex } from "../../shared/arrangement/get-host-track-index.js";
import * as console from "../../shared/v8-max-console.js";
import {
  getMinimalClipInfo,
  createClipsForLength,
  findRoutingOptionForDuplicateNames,
  parseArrangementLength,
} from "./duplicate-helpers.js";

/**
 * Remove the Producer Pal device from a duplicated track if it was the host track
 * @param {number} trackIndex - Original track index
 * @param {boolean} withoutDevices - Whether devices were excluded
 * @param {object} newTrack - The new track LiveAPI object
 */
function removeHostTrackDevice(trackIndex, withoutDevices, newTrack) {
  const hostTrackIndex = getHostTrackIndex();
  if (trackIndex === hostTrackIndex && withoutDevices !== true) {
    try {
      const thisDevice = new LiveAPI("this_device");
      const thisDevicePath = thisDevice.path;

      // Extract device index from path like "live_set tracks 1 devices 0"
      const deviceIndexMatch = thisDevicePath.match(/devices (\d+)/);
      if (deviceIndexMatch) {
        const deviceIndex = parseInt(deviceIndexMatch[1]);
        newTrack.call("delete_device", deviceIndex);
        console.error(
          "Removed Producer Pal device from duplicated track - the device cannot be duplicated",
        );
      }
    } catch (_error) {
      // If we can't access this_device, just continue without removing anything
      console.error(
        "Warning: Could not check for Producer Pal device in duplicated track",
      );
    }
  }
}

/**
 * Delete all devices from a track
 * @param {object} newTrack - The track LiveAPI object
 */
function deleteAllDevices(newTrack) {
  const deviceIds = newTrack.getChildIds("devices");
  const deviceCount = deviceIds.length;
  // Delete from the end backwards to avoid index shifting
  for (let i = deviceCount - 1; i >= 0; i--) {
    newTrack.call("delete_device", i);
  }
}

/**
 * Collect or delete clips from a duplicated track
 * @param {object} newTrack - The new track LiveAPI object
 * @param {boolean} withoutClips - Whether to delete clips instead of collecting them
 * @returns {Array} Array of clip info objects
 */
function processClipsForDuplication(newTrack, withoutClips) {
  const duplicatedClips = [];

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
 * @param {object} newTrack - The track LiveAPI object
 */
function deleteSessionClips(newTrack) {
  const sessionClipSlotIds = newTrack.getChildIds("clip_slots");
  for (const clipSlotId of sessionClipSlotIds) {
    const clipSlot = new LiveAPI(clipSlotId);
    if (clipSlot.getProperty("has_clip")) {
      clipSlot.call("delete_clip");
    }
  }
}

/**
 * Delete all arrangement clips from a track
 * @param {object} newTrack - The track LiveAPI object
 */
function deleteArrangementClips(newTrack) {
  const arrangementClipIds = newTrack.getChildIds("arrangement_clips");
  for (const clipId of arrangementClipIds) {
    newTrack.call("delete_clip", clipId);
  }
}

/**
 * Collect info about session clips in a track
 * @param {object} newTrack - The track LiveAPI object
 * @param {Array} duplicatedClips - Array to append clip info to
 */
function collectSessionClips(newTrack, duplicatedClips) {
  const sessionClipSlotIds = newTrack.getChildIds("clip_slots");
  for (const clipSlotId of sessionClipSlotIds) {
    const clipSlot = new LiveAPI(clipSlotId);
    if (clipSlot.getProperty("has_clip")) {
      const clip = new LiveAPI(`${clipSlot.path} clip`);
      duplicatedClips.push(getMinimalClipInfo(clip, ["trackIndex"]));
    }
  }
}

/**
 * Collect info about arrangement clips in a track
 * @param {object} newTrack - The track LiveAPI object
 * @param {Array} duplicatedClips - Array to append clip info to
 */
function collectArrangementClips(newTrack, duplicatedClips) {
  const arrangementClipIds = newTrack.getChildIds("arrangement_clips");
  for (const clipId of arrangementClipIds) {
    const clip = new LiveAPI(clipId);
    if (clip.exists()) {
      duplicatedClips.push(getMinimalClipInfo(clip, ["trackIndex"]));
    }
  }
}

/**
 * Configure the source track input routing
 * @param {object} sourceTrack - The source track LiveAPI object
 * @param {string} sourceTrackName - The source track name
 */
function configureSourceTrackInput(sourceTrack, sourceTrackName) {
  // Arm the source track for input
  const currentArm = sourceTrack.getProperty("arm");
  sourceTrack.set("arm", 1);
  if (currentArm !== 1) {
    console.error(`routeToSource: Armed the source track`);
  }

  const currentInputType = sourceTrack.getProperty("input_routing_type");
  const currentInputName = currentInputType?.display_name;

  if (currentInputName !== "No Input") {
    // Set source track input to "No Input" to prevent unwanted external input
    const sourceInputTypes = sourceTrack.getProperty(
      "available_input_routing_types",
    );
    const noInput = sourceInputTypes?.find(
      (type) => type.display_name === "No Input",
    );

    if (noInput) {
      sourceTrack.setProperty("input_routing_type", {
        identifier: noInput.identifier,
      });
      // Warn that input routing changed
      console.error(
        `Warning: Changed track "${sourceTrackName}" input routing from "${currentInputName}" to "No Input"`,
      );
    } else {
      console.error(
        `Warning: Tried to change track "${sourceTrackName}" input routing from "${currentInputName}" to "No Input" but could not find "No Input"`,
      );
    }
  }
}

/**
 * Find source routing for duplicate track
 * @param {object} sourceTrack - The source track LiveAPI object
 * @param {string} sourceTrackName - The source track name
 * @param {Array} availableTypes - Available routing types
 * @returns {object | undefined} The routing type to use
 */
function findSourceRouting(sourceTrack, sourceTrackName, availableTypes) {
  // Check if there are duplicate track names
  const matchingNames =
    availableTypes?.filter((type) => type.display_name === sourceTrackName) ||
    [];

  if (matchingNames.length > 1) {
    // Multiple tracks with the same name - use duplicate-aware matching
    const sourceRouting = findRoutingOptionForDuplicateNames(
      sourceTrack,
      sourceTrackName,
      availableTypes,
    );

    if (!sourceRouting) {
      console.error(
        `Warning: Could not route to "${sourceTrackName}" due to duplicate track names. ` +
          `Consider renaming tracks to have unique names.`,
      );
    }
    return sourceRouting;
  }

  // Simple case - use the single match (or undefined if no match)
  return matchingNames[0];
}

/**
 * Apply output routing configuration to the new track
 * @param {object} newTrack - The new track LiveAPI object
 * @param {string} sourceTrackName - The source track name
 * @param {Array} availableTypes - Available routing types
 * @param {object} sourceTrack - The source track LiveAPI object
 */
function applyOutputRouting(
  newTrack,
  sourceTrackName,
  availableTypes,
  sourceTrack,
) {
  const sourceRouting = findSourceRouting(
    sourceTrack,
    sourceTrackName,
    availableTypes,
  );

  if (sourceRouting) {
    newTrack.setProperty("output_routing_type", {
      identifier: sourceRouting.identifier,
    });
    // Let Live set the default channel for this routing type
  } else {
    const matchingNames =
      availableTypes?.filter((type) => type.display_name === sourceTrackName) ||
      [];
    if (matchingNames.length === 0) {
      console.error(
        `Warning: Could not find track "${sourceTrackName}" in routing options`,
      );
    }
  }
}

/**
 * Configure routing to source track
 * @param {object} newTrack - The new track LiveAPI object
 * @param {number} sourceTrackIndex - Source track index
 */
function configureRouting(newTrack, sourceTrackIndex) {
  const sourceTrack = new LiveAPI(`live_set tracks ${sourceTrackIndex}`);
  const sourceTrackName = sourceTrack.getProperty("name");

  configureSourceTrackInput(sourceTrack, sourceTrackName);

  const availableTypes = newTrack.getProperty("available_output_routing_types");

  applyOutputRouting(newTrack, sourceTrackName, availableTypes, sourceTrack);
}

/**
 * Duplicate a track
 * @param {number} trackIndex - Track index to duplicate
 * @param {string} [name] - Optional name for the duplicated track
 * @param {boolean} [withoutClips] - Whether to exclude clips when duplicating
 * @param {boolean} [withoutDevices] - Whether to exclude devices when duplicating
 * @param {boolean} [routeToSource] - Whether to route the new track to the source track
 * @param {number} [sourceTrackIndex] - Source track index for routing
 * @returns {object} Track info object with id, trackIndex, and clips array
 */
export function duplicateTrack(
  trackIndex,
  name,
  withoutClips,
  withoutDevices,
  routeToSource,
  sourceTrackIndex,
) {
  const liveSet = new LiveAPI("live_set");
  liveSet.call("duplicate_track", trackIndex);

  const newTrackIndex = trackIndex + 1;
  const newTrack = new LiveAPI(`live_set tracks ${newTrackIndex}`);

  if (name != null) {
    newTrack.set("name", name);
  }

  removeHostTrackDevice(trackIndex, withoutDevices, newTrack);

  if (withoutDevices === true) {
    deleteAllDevices(newTrack);
  }

  const duplicatedClips = processClipsForDuplication(newTrack, withoutClips);

  if (routeToSource) {
    configureRouting(newTrack, sourceTrackIndex);
  }

  return {
    id: newTrack.id,
    trackIndex: newTrackIndex,
    clips: duplicatedClips,
  };
}

/**
 * Duplicate a scene
 * @param {number} sceneIndex - Scene index to duplicate
 * @param {string} [name] - Optional name for the duplicated scene
 * @param {boolean} [withoutClips] - Whether to exclude clips when duplicating
 * @returns {object} Scene info object with id, sceneIndex, and clips array
 */
export function duplicateScene(sceneIndex, name, withoutClips) {
  const liveSet = new LiveAPI("live_set");
  liveSet.call("duplicate_scene", sceneIndex);

  const newSceneIndex = sceneIndex + 1;
  const newScene = new LiveAPI(`live_set scenes ${newSceneIndex}`);

  if (name != null) {
    newScene.set("name", name);
  }

  // Get all duplicated clips in this scene
  const duplicatedClips = [];
  const trackIds = liveSet.getChildIds("tracks");

  if (withoutClips === true) {
    // Delete all clips in the duplicated scene
    for (let trackIndex = 0; trackIndex < trackIds.length; trackIndex++) {
      const clipSlot = new LiveAPI(
        `live_set tracks ${trackIndex} clip_slots ${newSceneIndex}`,
      );
      if (clipSlot.exists() && clipSlot.getProperty("has_clip")) {
        clipSlot.call("delete_clip");
      }
    }
  } else {
    // Default behavior: collect info about duplicated clips
    for (let trackIndex = 0; trackIndex < trackIds.length; trackIndex++) {
      const clipSlot = new LiveAPI(
        `live_set tracks ${trackIndex} clip_slots ${newSceneIndex}`,
      );
      if (clipSlot.exists() && clipSlot.getProperty("has_clip")) {
        const clip = new LiveAPI(`${clipSlot.path} clip`);
        if (clip.exists()) {
          duplicatedClips.push(getMinimalClipInfo(clip, ["sceneIndex"]));
        }
      }
    }
  }

  // Return optimistic metadata
  const result = {
    id: newScene.id,
    sceneIndex: newSceneIndex,
    clips: duplicatedClips,
  };

  return result;
}

/**
 * Calculate the length of a scene (longest clip in the scene)
 * @param {number} sceneIndex - Scene index
 * @returns {number} Length in Ableton beats
 */
export function calculateSceneLength(sceneIndex) {
  const liveSet = new LiveAPI("live_set");
  const trackIds = liveSet.getChildIds("tracks");

  let maxLength = 4; // Default minimum scene length

  for (let trackIndex = 0; trackIndex < trackIds.length; trackIndex++) {
    const clipSlot = new LiveAPI(
      `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`,
    );

    if (clipSlot.exists() && clipSlot.getProperty("has_clip")) {
      const clip = new LiveAPI(`${clipSlot.path} clip`);
      const clipLength = clip.getProperty("length");
      maxLength = Math.max(maxLength, clipLength);
    }
  }

  return maxLength;
}

/**
 * Assign scene name to clip info objects
 * @param {Array} clips - Array of clip info objects
 * @param {string} name - Name to assign to each clip
 */
function assignNamesToClips(clips, name) {
  for (const clipInfo of clips) {
    clipInfo.name = name;
  }
}

/**
 * Duplicate a scene to the arrangement view
 * @param {string} sceneId - Scene ID to duplicate
 * @param {number} arrangementStartBeats - Start position in beats
 * @param {string} [name] - Optional name for the duplicated clips
 * @param {boolean} [withoutClips] - Whether to exclude clips when duplicating
 * @param {string} [arrangementLength] - Optional length in bar:beat format
 * @param {number} songTimeSigNumerator - Song time signature numerator
 * @param {number} songTimeSigDenominator - Song time signature denominator
 * @param {object} [context] - Context object with holdingAreaStartBeats and silenceWavPath
 * @returns {object} Object with arrangementStart and clips array
 */
export function duplicateSceneToArrangement(
  sceneId,
  arrangementStartBeats,
  name,
  withoutClips,
  arrangementLength,
  songTimeSigNumerator,
  songTimeSigDenominator,
  context = {},
) {
  const scene = LiveAPI.from(sceneId);

  if (!scene.exists()) {
    throw new Error(
      `duplicate failed: scene with id "${sceneId}" does not exist`,
    );
  }

  const sceneIndex = scene.sceneIndex;
  if (sceneIndex == null) {
    throw new Error(
      `duplicate failed: no scene index for id "${sceneId}" (path="${scene.path}")`,
    );
  }

  const liveSet = new LiveAPI("live_set");
  const trackIds = liveSet.getChildIds("tracks");

  const duplicatedClips = [];

  if (withoutClips !== true) {
    // Determine the length to use for all clips
    let arrangementLengthBeats;
    if (arrangementLength != null) {
      arrangementLengthBeats = parseArrangementLength(
        arrangementLength,
        songTimeSigNumerator,
        songTimeSigDenominator,
      );
    } else {
      // Default to the length of the longest clip in the scene
      arrangementLengthBeats = calculateSceneLength(sceneIndex);
    }

    // Only duplicate clips if withoutClips is not explicitly true
    // Find all clips in this scene and duplicate them to arrangement
    for (let trackIndex = 0; trackIndex < trackIds.length; trackIndex++) {
      const clipSlot = new LiveAPI(
        `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`,
      );

      if (clipSlot.exists() && clipSlot.getProperty("has_clip")) {
        const clip = new LiveAPI(`${clipSlot.path} clip`);
        const track = new LiveAPI(`live_set tracks ${trackIndex}`);

        // Use the new length-aware clip creation logic
        // Omit arrangementStart since all clips share the same start time
        const clipsForTrack = createClipsForLength(
          clip,
          track,
          arrangementStartBeats,
          arrangementLengthBeats,
          name,
          ["arrangementStart"],
          context,
        );

        // Add the scene name to each clip result if provided
        if (name != null) {
          assignNamesToClips(clipsForTrack, name);
        }

        duplicatedClips.push(...clipsForTrack);
      }
    }
  }

  return {
    arrangementStart: abletonBeatsToBarBeat(
      arrangementStartBeats,
      songTimeSigNumerator,
      songTimeSigDenominator,
    ),
    clips: duplicatedClips,
  };
}
