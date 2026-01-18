import * as console from "#src/shared/v8-max-console.js";
import {
  LIVE_API_MONITORING_STATE_AUTO,
  LIVE_API_MONITORING_STATE_IN,
  LIVE_API_MONITORING_STATE_OFF,
  MONITORING_STATE,
} from "#src/tools/constants.js";
import { verifyColorQuantization } from "#src/tools/shared/color-verification-helpers.js";
import {
  parseCommaSeparatedIds,
  unwrapSingleResult,
} from "#src/tools/shared/utils.js";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.js";

/**
 * Apply routing properties to a track
 * @param {LiveAPI} track - Track object
 * @param {object} params - Routing properties
 * @param {string} params.inputRoutingTypeId - Input routing type ID
 * @param {string} params.inputRoutingChannelId - Input routing channel ID
 * @param {string} params.outputRoutingTypeId - Output routing type ID
 * @param {string} params.outputRoutingChannelId - Output routing channel ID
 */
function applyRoutingProperties(
  track,
  {
    inputRoutingTypeId,
    inputRoutingChannelId,
    outputRoutingTypeId,
    outputRoutingChannelId,
  },
) {
  if (inputRoutingTypeId != null) {
    track.setProperty("input_routing_type", {
      identifier: Number(inputRoutingTypeId),
    });
  }

  if (inputRoutingChannelId != null) {
    track.setProperty("input_routing_channel", {
      identifier: Number(inputRoutingChannelId),
    });
  }

  if (outputRoutingTypeId != null) {
    track.setProperty("output_routing_type", {
      identifier: Number(outputRoutingTypeId),
    });
  }

  if (outputRoutingChannelId != null) {
    track.setProperty("output_routing_channel", {
      identifier: Number(outputRoutingChannelId),
    });
  }
}

/**
 * Apply monitoring state to a track
 * @param {LiveAPI} track - Track object
 * @param {string} monitoringState - Monitoring state value (in, auto, off)
 */
function applyMonitoringState(track, monitoringState) {
  if (monitoringState == null) {
    return;
  }

  const monitoringValue = {
    [MONITORING_STATE.IN]: LIVE_API_MONITORING_STATE_IN,
    [MONITORING_STATE.AUTO]: LIVE_API_MONITORING_STATE_AUTO,
    [MONITORING_STATE.OFF]: LIVE_API_MONITORING_STATE_OFF,
  }[monitoringState];

  if (monitoringValue === undefined) {
    console.error(
      `Warning: invalid monitoring state "${monitoringState}". Must be one of: ${Object.values(MONITORING_STATE).join(", ")}`,
    );

    return;
  }

  track.set("current_monitoring_state", monitoringValue);
}

/**
 * Apply send properties to a track
 * @param {LiveAPI} track - Track object
 * @param {number} sendGainDb - Send gain in dB (-70 to 0)
 * @param {string} sendReturn - Return track name (exact or letter prefix)
 */
function applySendProperties(track, sendGainDb, sendReturn) {
  // Validate both params provided together
  if ((sendGainDb != null) !== (sendReturn != null)) {
    console.error("Warning: sendGainDb and sendReturn must both be specified");

    return;
  }

  if (sendGainDb == null) {
    return;
  }

  // Get mixer and sends
  const mixer = LiveAPI.from(track.path + " mixer_device");

  if (!mixer.exists()) {
    console.error(`Warning: track ${track.id} has no mixer device`);

    return;
  }

  const sends = mixer.getChildren("sends");

  if (sends.length === 0) {
    console.error(`Warning: track ${track.id} has no sends`);

    return;
  }

  // Find matching send by return track name
  // Match exact name OR letter prefix (e.g., "A" matches "A-Reverb")
  const liveSet = LiveAPI.from("live_set");
  const returnTrackIds = liveSet.getChildIds("return_tracks");

  let sendIndex = -1;

  for (let i = 0; i < returnTrackIds.length; i++) {
    const rt = LiveAPI.from(`live_set return_tracks ${i}`);
    const name = /** @type {string} */ (rt.getProperty("name"));

    // Match exact name or single-letter prefix
    if (name === sendReturn || name.startsWith(sendReturn + "-")) {
      sendIndex = i;
      break;
    }
  }

  if (sendIndex === -1) {
    console.error(`Warning: no return track found matching "${sendReturn}"`);

    return;
  }

  if (sendIndex >= sends.length) {
    console.error(
      `Warning: send ${sendIndex} doesn't exist on track ${track.id}`,
    );

    return;
  }

  // Set the send gain
  sends[sendIndex].set("display_value", sendGainDb);
}

/**
 * Apply stereo panning and warn about invalid params
 * @param {LiveAPI} mixer - Mixer device object
 * @param {number} pan - Pan value
 * @param {number} leftPan - Left pan value
 * @param {number} rightPan - Right pan value
 */
function applyStereoPan(mixer, pan, leftPan, rightPan) {
  if (pan != null) {
    const panning = LiveAPI.from(mixer.path + " panning");

    if (panning.exists()) {
      panning.set("value", pan);
    }
  }

  if (leftPan != null || rightPan != null) {
    console.error(
      "updateTrack: leftPan and rightPan have no effect in stereo panning mode. " +
        "Set panningMode to 'split' or use 'pan' instead.",
    );
  }
}

/**
 * Apply split panning and warn about invalid params
 * @param {LiveAPI} mixer - Mixer device object
 * @param {number} pan - Pan value
 * @param {number} leftPan - Left pan value
 * @param {number} rightPan - Right pan value
 */
function applySplitPan(mixer, pan, leftPan, rightPan) {
  if (leftPan != null) {
    const leftSplit = LiveAPI.from(mixer.path + " left_split_stereo");

    if (leftSplit.exists()) {
      leftSplit.set("value", leftPan);
    }
  }

  if (rightPan != null) {
    const rightSplit = LiveAPI.from(mixer.path + " right_split_stereo");

    if (rightSplit.exists()) {
      rightSplit.set("value", rightPan);
    }
  }

  if (pan != null) {
    console.error(
      "updateTrack: pan has no effect in split panning mode. " +
        "Set panningMode to 'stereo' or use leftPan/rightPan instead.",
    );
  }
}

/**
 * Apply mixer properties (gain and panning) to a track
 * @param {LiveAPI} track - Track object
 * @param {object} params - Mixer properties
 * @param {number} params.gainDb - Track gain in dB (-70 to 6)
 * @param {number} params.pan - Pan position in stereo mode (-1 to 1)
 * @param {string} params.panningMode - Panning mode ("stereo" or "split")
 * @param {number} params.leftPan - Left channel pan in split mode (-1 to 1)
 * @param {number} params.rightPan - Right channel pan in split mode (-1 to 1)
 */
function applyMixerProperties(
  track,
  { gainDb, pan, panningMode, leftPan, rightPan },
) {
  const mixer = LiveAPI.from(track.path + " mixer_device");

  if (!mixer.exists()) {
    return;
  }

  // Handle gain (independent of panning mode)
  if (gainDb != null) {
    const volume = LiveAPI.from(mixer.path + " volume");

    if (volume.exists()) {
      volume.set("display_value", gainDb);
    }
  }

  // Get current panning mode
  const currentMode = mixer.getProperty("panning_mode");
  const currentIsSplit = currentMode === 1;

  // Set new panning mode if provided
  if (panningMode != null) {
    const newMode = panningMode === "split" ? 1 : 0;

    mixer.set("panning_mode", newMode);
  }

  // Determine effective mode for validation
  const effectiveMode =
    panningMode != null ? panningMode : currentIsSplit ? "split" : "stereo";

  // Handle panning based on effective mode
  if (effectiveMode === "stereo") {
    applyStereoPan(mixer, pan, leftPan, rightPan);
  } else {
    applySplitPan(mixer, pan, leftPan, rightPan);
  }
}

/**
 * @typedef {object} UpdateTrackArgs
 * @property {string} ids - Track ID or comma-separated list of track IDs to update
 * @property {string} [name] - Optional track name
 * @property {string} [color] - Optional track color (CSS format: hex)
 * @property {number} [gainDb] - Optional track gain in dB (-70 to 6)
 * @property {number} [pan] - Optional pan position in stereo mode (-1 to 1)
 * @property {string} [panningMode] - Optional panning mode ('stereo' or 'split')
 * @property {number} [leftPan] - Optional left channel pan in split mode (-1 to 1)
 * @property {number} [rightPan] - Optional right channel pan in split mode (-1 to 1)
 * @property {boolean} [mute] - Optional mute state
 * @property {boolean} [solo] - Optional solo state
 * @property {boolean} [arm] - Optional arm state
 * @property {string} [inputRoutingTypeId] - Optional input routing type identifier
 * @property {string} [inputRoutingChannelId] - Optional input routing channel identifier
 * @property {string} [outputRoutingTypeId] - Optional output routing type identifier
 * @property {string} [outputRoutingChannelId] - Optional output routing channel identifier
 * @property {string} [monitoringState] - Optional monitoring state ('in', 'auto', 'off')
 * @property {boolean} [arrangementFollower] - Whether the track should follow the arrangement timeline
 * @property {number} [sendGainDb] - Optional send gain in dB (-70 to 0), requires sendReturn
 * @property {string} [sendReturn] - Optional return track name (exact or letter prefix), requires sendGainDb
 */

/**
 * Updates properties of existing tracks
 * @param {UpdateTrackArgs} args - The track parameters
 * @param {Partial<ToolContext>} [_context] - Internal context object (unused)
 * @returns {object | Array<object>} Single track object or array of track objects
 */
export function updateTrack(
  {
    ids,
    name,
    color,
    gainDb,
    pan,
    panningMode,
    leftPan,
    rightPan,
    mute,
    solo,
    arm,
    inputRoutingTypeId,
    inputRoutingChannelId,
    outputRoutingTypeId,
    outputRoutingChannelId,
    monitoringState,
    arrangementFollower,
    sendGainDb,
    sendReturn,
  },
  _context = {},
) {
  if (!ids) {
    throw new Error("updateTrack failed: ids is required");
  }

  // Parse comma-separated string into array
  const trackIds = parseCommaSeparatedIds(ids);

  // Validate all IDs are tracks, skip invalid ones
  const tracks = validateIdTypes(trackIds, "track", "updateTrack", {
    skipInvalid: true,
  });

  const updatedTracks = [];

  for (const track of tracks) {
    track.setAll({
      name,
      color,
      mute,
      solo,
      arm,
    });

    // Verify color quantization if color was set
    if (color != null) {
      verifyColorQuantization(track, color);
    }

    // Handle mixer properties
    if (
      gainDb != null ||
      pan != null ||
      panningMode != null ||
      leftPan != null ||
      rightPan != null
    ) {
      applyMixerProperties(track, {
        gainDb,
        pan,
        panningMode,
        leftPan,
        rightPan,
      });
    }

    // Handle routing properties
    applyRoutingProperties(track, {
      inputRoutingTypeId,
      inputRoutingChannelId,
      outputRoutingTypeId,
      outputRoutingChannelId,
    });

    // Handle arrangement follower
    if (arrangementFollower != null) {
      track.set("back_to_arranger", arrangementFollower ? 0 : 1);
    }

    // Handle monitoring state
    applyMonitoringState(track, monitoringState);

    // Handle send properties
    applySendProperties(track, sendGainDb, sendReturn);

    // Build optimistic result object
    updatedTracks.push({
      id: track.id,
    });
  }

  return unwrapSingleResult(updatedTracks);
}
