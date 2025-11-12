import {
  abletonBeatsToBarBeat,
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "../../notation/barbeat/barbeat-time";
import * as console from "../../shared/v8-max-console";
import { MAX_CLIP_BEATS } from "../constants";
import { select } from "../control/select.js";
import { getHostTrackIndex } from "../shared/get-host-track-index.js";
import { validateIdType } from "../shared/id-validation.js";

/**
 * Parse arrangementLength from bar:beat duration format to absolute beats
 * @param {string} arrangementLength - Length in bar:beat duration format (e.g. "2:0" for exactly two bars)
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {number} Length in Ableton beats
 */
function parseArrangementLength(
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
 * Create clips to fill the specified arrangement length
 * @param {LiveAPI} sourceClip - The source clip to duplicate
 * @param {LiveAPI} track - The track to create clips on
 * @param {number} arrangementStartBeats - Start time in beats  (TODO: clarify if this is ableton beats or musical beats)
 * @param {number} arrangementLengthBeats - Total length to fill in beats (TODO: clarify if this is ableton beats or musical beats)
 * @param {string} [name] - Optional name for the clips
 * @param {Array<string>} [omitFields] - Optional fields to omit from clip info
 * @returns {Array<Object>} Array of minimal clip info objects
 */
function createClipsForLength(
  sourceClip,
  track,
  arrangementStartBeats,
  arrangementLengthBeats,
  name,
  omitFields = [],
) {
  const originalClipLength = sourceClip.getProperty("length");
  const isLooping = sourceClip.getProperty("looping") > 0;
  const duplicatedClips = [];

  // IMPORTANT: Preserve source clip data BEFORE creating any new clips.
  // Ableton's create_midi_clip deletes any existing clip at the exact same position and length,
  // so we must read all data from sourceClip before it potentially gets deleted.
  const sourceClipData = {
    name: sourceClip.getProperty("name"),
    color: sourceClip.getColor(),
    signature_numerator: sourceClip.getProperty("signature_numerator"),
    signature_denominator: sourceClip.getProperty("signature_denominator"),
    looping: sourceClip.getProperty("looping"),
    loop_start: sourceClip.getProperty("loop_start"),
    loop_end: sourceClip.getProperty("loop_end"),
    is_midi_clip: sourceClip.getProperty("is_midi_clip"),
    notes: null,
  };

  // Get notes if it's a MIDI clip
  if (sourceClipData.is_midi_clip) {
    const notesResult = sourceClip.call(
      "get_notes_extended",
      0,
      128,
      0,
      MAX_CLIP_BEATS,
    );
    if (notesResult != null) {
      const { notes } = JSON.parse(notesResult);
      if (notes && notes.length > 0) {
        // Remove note IDs since we'll be creating new notes
        for (const note of notes) {
          delete note.note_id;
        }
        sourceClipData.notes = notes;
      }
    }
  }

  if (arrangementLengthBeats <= originalClipLength) {
    // Case 1: Shorter than or equal to clip length - create clip with exact length
    const newClipResult = track.call(
      "create_midi_clip",
      arrangementStartBeats,
      arrangementLengthBeats,
    );
    const newClip = LiveAPI.from(newClipResult);

    // Copy all properties from the preserved clip data
    copyClipPropertiesFromData(sourceClipData, newClip, name);

    duplicatedClips.push(getMinimalClipInfo(newClip, omitFields));
  } else if (isLooping) {
    // Case 2: Longer than clip length and clip is looping - create multiple clips
    let currentStartBeats = arrangementStartBeats;
    let remainingLength = arrangementLengthBeats;

    while (remainingLength > 0) {
      const clipLength = Math.min(remainingLength, originalClipLength);
      const newClipResult = track.call(
        "create_midi_clip",
        currentStartBeats,
        clipLength,
      );
      const newClip = LiveAPI.from(newClipResult);

      // Copy all properties from the preserved clip data
      copyClipPropertiesFromData(sourceClipData, newClip, name);

      duplicatedClips.push(getMinimalClipInfo(newClip, omitFields));

      remainingLength -= clipLength;
      currentStartBeats += clipLength;
    }
  } else {
    // Case 3: Longer than clip length but clip is not looping - use original length
    const newClipResult = track.call(
      "duplicate_clip_to_arrangement",
      `id ${sourceClip.id}`,
      arrangementStartBeats,
    );
    const newClip = LiveAPI.from(newClipResult);

    newClip.setAll({
      name: name,
    });

    duplicatedClips.push(getMinimalClipInfo(newClip, omitFields));
  }

  return duplicatedClips;
}

/**
 * Find the correct routing option for a track when duplicate names exist
 * @param {LiveAPI} sourceTrack - The source track LiveAPI object
 * @param {string} sourceTrackName - The source track's name
 * @param {Array} availableTypes - Available output routing types from the new track
 * @returns {Object|undefined} The correct routing option or undefined
 */
function findRoutingOptionForDuplicateNames(
  sourceTrack,
  sourceTrackName,
  availableTypes,
) {
  // Get all routing options with the same name
  const matchingOptions = availableTypes.filter(
    (type) => type.display_name === sourceTrackName,
  );

  // If only one match, return it (no duplicates)
  if (matchingOptions.length <= 1) {
    return matchingOptions[0];
  }

  // Multiple matches - need to find the correct one
  const liveSet = new LiveAPI("live_set");
  const allTrackIds = liveSet.getChildIds("tracks");

  // Find all tracks with the same name and their info
  const tracksWithSameName = allTrackIds
    .map((trackId, index) => {
      const track = new LiveAPI(trackId);
      return {
        index,
        id: track.id,
        name: track.getProperty("name"),
      };
    })
    .filter((track) => track.name === sourceTrackName);

  // Sort by ID (creation order) - IDs are numeric strings
  tracksWithSameName.sort((a, b) => {
    const idA = parseInt(a.id);
    const idB = parseInt(b.id);
    return idA - idB;
  });

  // Find source track's position in the sorted list
  const sourcePosition = tracksWithSameName.findIndex(
    (track) => track.id === sourceTrack.id,
  );

  if (sourcePosition === -1) {
    console.error(
      `Warning: Could not find source track in duplicate name list for "${sourceTrackName}"`,
    );
    return undefined;
  }

  // Return the routing option at the same position
  return matchingOptions[sourcePosition];
}

/**
 * Copy clip properties from preserved data object to destination clip
 * @param {Object} sourceClipData - Preserved clip data
 * @param {LiveAPI} destClip - The clip to copy to
 * @param {string} [name] - Optional name override
 */
function copyClipPropertiesFromData(sourceClipData, destClip, name) {
  // Set all properties using setAll
  const properties = {
    name: (name ?? sourceClipData.name) || null, // empty names are not allowed
    color: sourceClipData.color,
    signature_numerator: sourceClipData.signature_numerator,
    signature_denominator: sourceClipData.signature_denominator,
    looping: sourceClipData.looping,
    loop_start: sourceClipData.loop_start,
    loop_end: sourceClipData.loop_end,
  };

  destClip.setAll(properties);

  // Add notes if we have them
  if (sourceClipData.notes && sourceClipData.notes.length > 0) {
    destClip.call("add_new_notes", { notes: sourceClipData.notes });
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
 * @returns {Object|Array<Object>} Result object(s) with information about the duplicated object(s)
 */
export function duplicate({
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
} = {}) {
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

    // TODO? Default to session like scene duplication?
    if (!["session", "arrangement"].includes(destination)) {
      throw new Error(
        "duplicate failed: destination must be 'session' or 'arrangement'",
      );
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
        throw new Error(
          `duplicate failed: no track or clip slot index for clip id "${id}" (path="${object.path}")`,
        );
      }

      // For session clips, duplicate_clip_slot always creates at source+1,
      // so we call it on the progressively increasing source index
      const sourceSceneIndex = sceneIndex + i;
      newObjectMetadata = duplicateClipSlot(
        trackIndex,
        sourceSceneIndex,
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

/**
 * Get minimal information about a clip for duplication results
 * @param {LiveAPI} clip - The clip to get info from
 * @param {Array<string>} [omitFields] - Optional fields to omit from the result
 * @returns {Object} Minimal clip info with id and location
 */
function getMinimalClipInfo(clip, omitFields = []) {
  const isArrangementClip = clip.getProperty("is_arrangement_clip") > 0;

  if (isArrangementClip) {
    const trackIndex = clip.trackIndex;
    if (trackIndex == null) {
      throw new Error(
        `getMinimalClipInfo failed: could not determine trackIndex for clip (path="${clip.path}")`,
      );
    }

    const arrangementStartBeats = clip.getProperty("start_time");

    // Convert to bar|beat format using song time signature
    const liveSet = new LiveAPI("live_set");
    const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
    const songTimeSigDenominator = liveSet.getProperty("signature_denominator");
    const arrangementStart = abletonBeatsToBarBeat(
      arrangementStartBeats,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );

    const result = {
      id: clip.id,
    };

    if (!omitFields.includes("trackIndex")) {
      result.trackIndex = trackIndex;
    }
    if (!omitFields.includes("arrangementStart")) {
      result.arrangementStart = arrangementStart;
    }

    return result;
  } else {
    const trackIndex = clip.trackIndex;
    const sceneIndex = clip.sceneIndex;

    if (trackIndex == null || sceneIndex == null) {
      throw new Error(
        `getMinimalClipInfo failed: could not determine trackIndex/sceneIndex for clip (path="${clip.path}")`,
      );
    }

    const result = {
      id: clip.id,
    };

    if (!omitFields.includes("trackIndex")) {
      result.trackIndex = trackIndex;
    }
    if (!omitFields.includes("sceneIndex")) {
      result.sceneIndex = sceneIndex;
    }

    return result;
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

function calculateSceneLength(sceneIndex) {
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

function duplicateClipSlot(trackIndex, sourceSceneIndex, name) {
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);

  if (!track.exists()) {
    throw new Error(
      `duplicate failed: track with index ${trackIndex} does not exist`,
    );
  }

  // duplicate_clip_slot creates a new clip at sourceSceneIndex + 1
  track.call("duplicate_clip_slot", sourceSceneIndex);

  const newSceneIndex = sourceSceneIndex + 1;
  const newClip = new LiveAPI(
    `live_set tracks ${trackIndex} clip_slots ${newSceneIndex} clip`,
  );

  if (name != null) {
    newClip.set("name", name);
  }

  // Return the new clip info directly
  return getMinimalClipInfo(newClip);
}

function duplicateClipToArrangement(
  clipId,
  arrangementStartBeats,
  name,
  arrangementLength,
  _songTimeSigNumerator,
  _songTimeSigDenominator,
) {
  // Support "id {id}" (such as returned by childIds()) and id values directly
  const clip = LiveAPI.from(clipId);

  if (!clip.exists()) {
    throw new Error(`duplicate failed: no clip exists for clipId "${clipId}"`);
  }

  const trackIndex = clip.trackIndex;
  if (trackIndex == null) {
    throw new Error(
      `duplicate failed: no track index for clipId "${clipId}" (path=${clip.path})`,
    );
  }

  const track = new LiveAPI(`live_set tracks ${trackIndex}`);
  const duplicatedClips = [];

  if (arrangementLength != null) {
    // Use the clip's time signature for duration calculation
    const clipTimeSigNumerator = clip.getProperty("signature_numerator");
    const clipTimeSigDenominator = clip.getProperty("signature_denominator");
    const arrangementLengthBeats = parseArrangementLength(
      arrangementLength,
      clipTimeSigNumerator,
      clipTimeSigDenominator,
    );
    // When creating multiple clips, omit trackIndex since they all share the same track
    const clipsCreated = createClipsForLength(
      clip,
      track,
      arrangementStartBeats,
      arrangementLengthBeats,
      name,
      ["trackIndex"],
    );
    duplicatedClips.push(...clipsCreated);
  } else {
    // No length specified - use original behavior
    const newClipResult = track.call(
      "duplicate_clip_to_arrangement",
      `id ${clip.id}`,
      arrangementStartBeats,
    );
    const newClip = LiveAPI.from(newClipResult);

    newClip.setAll({
      name: name,
    });

    duplicatedClips.push(getMinimalClipInfo(newClip));
  }

  // Return single clip info directly, or clips array with trackIndex for multiple
  if (duplicatedClips.length === 1) {
    return duplicatedClips[0];
  } else {
    return {
      trackIndex,
      clips: duplicatedClips,
    };
  }
}
