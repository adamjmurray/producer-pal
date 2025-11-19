import { barBeatToAbletonBeats } from "../../notation/barbeat/barbeat-time";
import { select } from "../control/select.js";
import { validateIdType } from "../shared/id-validation.js";
import {
  duplicateClipSlot,
  duplicateClipToArrangement,
} from "./duplicate-helpers.js";
import {
  duplicateTrack,
  duplicateScene,
  calculateSceneLength,
  duplicateSceneToArrangement,
} from "./duplicate-track-scene-helpers.js";

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
  }
  return createdObjects;
}
