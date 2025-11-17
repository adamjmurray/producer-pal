import {
  abletonBeatsToBarBeat,
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "../../notation/barbeat/barbeat-time";
import * as console from "../../shared/v8-max-console";
import { select } from "../control/select.js";
import { getHostTrackIndex } from "../shared/get-host-track-index.js";
import { validateIdType } from "../shared/id-validation.js";
import {
  getMinimalClipInfo,
  createClipsForLength,
  findRoutingOptionForDuplicateNames,
  duplicateClipSlot,
  duplicateClipToArrangement,
} from "./duplicate-helpers.js";

/**
 * Parse arrangementLength from bar:beat duration format to absolute beats
 * @param {string} arrangementLength - Length in bar:beat duration format (e.g. "2:0" for exactly two bars)
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {number} Length in Ableton beats
 */
export function parseArrangementLength(
  arrangementLength,
  timeSigNumerator,
  timeSigDenominator,
) {
  try {
    const arrangementLengthBeats = barBeatDurationToAbletonBeats(
      arrangementLength,
      timeSigNumerator,
      timeSigDenominator,
    );

    if (arrangementLengthBeats <= 0) {
      throw new Error(
        `duplicate failed: arrangementLength must be positive, got "${arrangementLength}"`,
      );
    }

    return arrangementLengthBeats;
  } catch (error) {
    if (error.message.includes("Invalid bar:beat duration format")) {
      throw new Error(`duplicate failed: ${error.message}`);
    }
    if (error.message.includes("must be 0 or greater")) {
      throw new Error(
        `duplicate failed: arrangementLength ${error.message.replace("in duration ", "")}`,
      );
    }
    throw error;
  }
}

/**
 * Duplicates an object based on its type.
 * Note: Duplicated Arrangement clips will only play if their tracks are currently following the Arrangement timeline.
 * @param {Object} args - The parameters
 * @param {string} args.type - Type of object to duplicate ("track", "scene", or "clip")
 * @param {string} args.id - ID of the object to duplicate
 * @param {number} [args.count=1] - Number of duplicates to create
 * @param {string} [args.destination] - Destination for clip duplication ("session" or "arrangement"), required when type is "clip"
 * @param {string} [args.arrangementStart] - Start time in bar|beat format for Arrangement view clips (uses song time signature)
 * @param {string} [args.arrangementLength] - Duration in bar:beat format (e.g., '4:0' = exactly 4 bars)
 * @param {string} [args.name] - Optional name for the duplicated object(s)
 * @param {boolean} [args.withoutClips] - Whether to exclude clips when duplicating tracks or scenes
 * @param {boolean} [args.withoutDevices] - Whether to exclude devices when duplicating tracks
 * @param {boolean} [args.routeToSource] - Whether to enable MIDI layering by routing the new track to the source track
 * @param {boolean} [args.switchView=false] - Automatically switch to the appropriate view based on destination or operation type
 * @param {number} [args.toTrackIndex] - Destination track index (required for session clips)
 * @param {number} [args.toSceneIndex] - Destination scene index (required for session clips)
 * @param {Object} [context] - Context object with holdingAreaStartBeats and silenceWavPath
 * @returns {Object|Array<Object>} Result object(s) with information about the duplicated object(s)
 */
export function duplicate(
  {
    type,
    id,
    count = 1,
    destination,
    arrangementStart,
    arrangementLength,
    name,
    withoutClips,
    withoutDevices,
    routeToSource,
    switchView,
    toTrackIndex,
    toSceneIndex,
  } = {},
  context = {
    holdingAreaStartBeats: 40000,
  },
) {
  if (!type) {
    throw new Error("duplicate failed: type is required");
  }

  const validTypes = ["track", "scene", "clip"];
  if (!validTypes.includes(type)) {
    throw new Error(
      `duplicate failed: type must be one of ${validTypes.join(", ")}`,
    );
  }

  if (!id) {
    throw new Error("duplicate failed: id is required");
  }

  if (count < 1) {
    throw new Error("duplicate failed: count must be at least 1");
  }

  // Auto-configure for routing back to source
  if (routeToSource) {
    if (type !== "track") {
      throw new Error(
        "duplicate failed: routeToSource is only supported for type 'track'",
      );
    }

    // Emit warnings if user provided conflicting parameters
    if (withoutClips === false) {
      console.error(
        "Warning: routeToSource requires withoutClips=true, ignoring user-provided withoutClips=false",
      );
    }
    if (withoutDevices === false) {
      console.error(
        "Warning: routeToSource requires withoutDevices=true, ignoring user-provided withoutDevices=false",
      );
    }

    withoutClips = true;
    withoutDevices = true;
  }

  // Validate the ID exists and matches the expected type
  const object = validateIdType(id, type, "duplicate");

  // Validate clip-specific and scene+arrangement parameters once
  if (type === "clip") {
    if (!destination) {
      throw new Error(
        "duplicate failed: destination is required for type 'clip'",
      );
    }

    // TODO: if arrangementStart is set, default to arrangement, or if toTrack/SceneIndex is set, default to session
    if (!["session", "arrangement"].includes(destination)) {
      throw new Error(
        "duplicate failed: destination must be 'session' or 'arrangement'",
      );
    }

    // Validate session clip destination parameters
    if (destination === "session") {
      if (toTrackIndex == null) {
        throw new Error(
          "duplicate failed: toTrackIndex is required for session clips",
        );
      }
      if (toSceneIndex == null) {
        throw new Error(
          "duplicate failed: toSceneIndex is required for session clips",
        );
      }
    }
  }

  if (destination === "arrangement" && arrangementStart == null) {
    throw new Error(
      "duplicate failed: arrangementStart is required when destination is 'arrangement'",
    );
  }

  const createdObjects = [];

  for (let i = 0; i < count; i++) {
    // Build the object name for this duplicate
    const objectName =
      name != null
        ? count === 1
          ? name
          : i === 0
            ? name
            : `${name} ${i + 1}`
        : undefined;

    let newObjectMetadata;

    if (destination === "arrangement") {
      // All arrangement operations need song time signature for bar|beat conversion
      const liveSet = new LiveAPI("live_set");
      const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
      const songTimeSigDenominator = liveSet.getProperty(
        "signature_denominator",
      );

      // Convert arrangementStart from bar|beat to Ableton beats once
      const baseArrangementStartBeats = barBeatToAbletonBeats(
        arrangementStart,
        songTimeSigNumerator,
        songTimeSigDenominator,
      );

      if (type === "scene") {
        const sceneIndex = object.sceneIndex;
        if (sceneIndex == null) {
          throw new Error(
            `duplicate failed: no scene index for id "${id}" (path="${object.path}")`,
          );
        }

        // For multiple scenes, place them sequentially to avoid overlap
        const sceneLength = calculateSceneLength(sceneIndex);
        const actualArrangementStartBeats =
          baseArrangementStartBeats + i * sceneLength;
        newObjectMetadata = duplicateSceneToArrangement(
          id,
          actualArrangementStartBeats,
          objectName,
          withoutClips,
          arrangementLength,
          songTimeSigNumerator,
          songTimeSigDenominator,
          context,
        );
      } else if (type === "clip") {
        // For multiple clips, place them sequentially to avoid overlap
        const clipLength = object.getProperty("length");
        const actualArrangementStartBeats =
          baseArrangementStartBeats + i * clipLength;
        newObjectMetadata = duplicateClipToArrangement(
          id,
          actualArrangementStartBeats,
          objectName,
          arrangementLength,
          songTimeSigNumerator,
          songTimeSigDenominator,
          context,
        );
      }
    } else if (type === "track") {
      // Session view operations (no bar|beat conversion needed)
      const trackIndex = object.trackIndex;
      if (trackIndex == null) {
        throw new Error(
          `duplicate failed: no track index for id "${id}" (path="${object.path}")`,
        );
      }
      // For multiple tracks, we need to account for previously created tracks
      const actualTrackIndex = trackIndex + i;
      newObjectMetadata = duplicateTrack(
        actualTrackIndex,
        objectName,
        withoutClips,
        withoutDevices,
        routeToSource,
        trackIndex, // Pass original source track index for routing
      );
    } else if (type === "scene") {
      const sceneIndex = object.sceneIndex;
      if (sceneIndex == null) {
        throw new Error(
          `duplicate failed: no scene index for id "${id}" (path="${object.path}")`,
        );
      }
      const actualSceneIndex = sceneIndex + i;
      newObjectMetadata = duplicateScene(
        actualSceneIndex,
        objectName,
        withoutClips,
      );
    } else if (type === "clip") {
      const trackIndex = object.trackIndex;
      const sceneIndex = object.sceneIndex;
      if (trackIndex == null || sceneIndex == null) {
        // We already validated object was a clip, so if we're here, this must be an arrangement
        // clip
        throw new Error(
          `unsupported duplicate operation: cannot duplicate arrangement clips to the session (source clip id="${id}" path="${object.path}") `,
        );
      }

      // For session clips with count > 1, place them sequentially at the destination track
      const actualToSceneIndex = toSceneIndex + i;
      newObjectMetadata = duplicateClipSlot(
        trackIndex,
        sceneIndex,
        toTrackIndex,
        actualToSceneIndex,
        objectName,
      );
    }

    createdObjects.push(newObjectMetadata);
  }

  // Handle view switching if requested
  if (switchView) {
    let targetView = null;
    if (destination === "arrangement") {
      targetView = "arrangement";
    } else if (
      destination === "session" ||
      type === "track" ||
      type === "scene"
    ) {
      targetView = "session";
    }

    if (targetView) {
      select({ view: targetView });
    }
  }

  // Return appropriate format based on count
  if (count === 1) {
    return createdObjects[0];
  } else {
    return createdObjects;
  }
}

function duplicateTrack(
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

  // Check if we're duplicating the Producer Pal host track and remove the device
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

  // Delete devices if withoutDevices is true
  if (withoutDevices === true) {
    const deviceIds = newTrack.getChildIds("devices");
    const deviceCount = deviceIds.length;
    // Delete from the end backwards to avoid index shifting
    for (let i = deviceCount - 1; i >= 0; i--) {
      newTrack.call("delete_device", i);
    }
  }

  // Get all duplicated clips
  const duplicatedClips = [];

  if (withoutClips === true) {
    // Delete all clips that were duplicated
    // Session clips
    const sessionClipSlotIds = newTrack.getChildIds("clip_slots");
    for (const clipSlotId of sessionClipSlotIds) {
      const clipSlot = new LiveAPI(clipSlotId);
      if (clipSlot.getProperty("has_clip")) {
        clipSlot.call("delete_clip");
      }
    }

    // Arrangement clips - must use track.delete_clip with clip ID
    const arrangementClipIds = newTrack.getChildIds("arrangement_clips");
    for (const clipId of arrangementClipIds) {
      newTrack.call("delete_clip", clipId);
    }
  } else {
    // Default behavior: collect info about duplicated clips
    // Session clips
    const sessionClipSlotIds = newTrack.getChildIds("clip_slots");
    //for (let sceneIndex = 0; sceneIndex < sessionClipSlotIds.length; sceneIndex++) {
    //const clipSlot = new LiveAPI(`live_set tracks ${newTrackIndex} clip_slots ${sceneIndex}`);
    for (const clipSlotId of sessionClipSlotIds) {
      const clipSlot = new LiveAPI(clipSlotId);
      if (clipSlot.getProperty("has_clip")) {
        const clip = new LiveAPI(`${clipSlot.path} clip`);
        duplicatedClips.push(getMinimalClipInfo(clip, ["trackIndex"]));
      }
    }

    // Arrangement clips
    const arrangementClipIds = newTrack.getChildIds("arrangement_clips");
    for (const clipId of arrangementClipIds) {
      const clip = new LiveAPI(clipId);
      if (clip.exists()) {
        duplicatedClips.push(getMinimalClipInfo(clip, ["trackIndex"]));
      }
    }
  }

  // Configure routing if requested
  if (routeToSource) {
    const sourceTrack = new LiveAPI(`live_set tracks ${sourceTrackIndex}`);
    const sourceTrackName = sourceTrack.getProperty("name");

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

    // Find source track in new track's available OUTPUT routing types
    const availableTypes = newTrack.getProperty(
      "available_output_routing_types",
    );

    // Check if there are duplicate track names
    const matchingNames =
      availableTypes?.filter((type) => type.display_name === sourceTrackName) ||
      [];

    let sourceRouting;
    if (matchingNames.length > 1) {
      // Multiple tracks with the same name - use duplicate-aware matching
      sourceRouting = findRoutingOptionForDuplicateNames(
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
    } else {
      // Simple case - use the single match (or undefined if no match)
      sourceRouting = matchingNames[0];
    }

    if (sourceRouting) {
      newTrack.setProperty("output_routing_type", {
        identifier: sourceRouting.identifier,
      });
      // Let Live set the default channel for this routing type
    } else if (matchingNames.length === 0) {
      console.error(
        `Warning: Could not find track "${sourceTrackName}" in routing options`,
      );
    }
  }

  return {
    id: newTrack.id,
    trackIndex: newTrackIndex,
    clips: duplicatedClips,
  };
}

function duplicateScene(sceneIndex, name, withoutClips) {
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

function duplicateSceneToArrangement(
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
          for (const clipInfo of clipsForTrack) {
            clipInfo.name = name;
          }
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
