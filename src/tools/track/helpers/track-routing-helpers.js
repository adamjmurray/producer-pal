import {
  LIVE_API_MONITORING_STATE_AUTO,
  LIVE_API_MONITORING_STATE_IN,
  LIVE_API_MONITORING_STATE_OFF,
  MONITORING_STATE,
} from "#src/tools/constants.js";

/**
 * @typedef {{ display_name: string, identifier: string | number }} RoutingInfo
 */

/**
 * Process current routing settings for a track
 * @param {LiveAPI} track - Track object
 * @param {string} category - Track category (regular, return, or master)
 * @param {boolean} isGroup - Whether the track is a group track
 * @param {boolean} canBeArmed - Whether the track can be armed
 * @returns {object} - Current routing settings
 */
export function processCurrentRouting(track, category, isGroup, canBeArmed) {
  if (category === "master") {
    return {
      inputRoutingType: null,
      inputRoutingChannel: null,
      outputRoutingType: null,
      outputRoutingChannel: null,
    };
  }

  /** @type {Record<string, unknown>} */
  const result = {};

  if (!isGroup && category === "regular") {
    const inputType = /** @type {RoutingInfo | null} */ (
      track.getProperty("input_routing_type")
    );

    result.inputRoutingType = inputType
      ? {
          name: inputType.display_name,
          inputId: String(inputType.identifier),
        }
      : null;

    const inputChannel = /** @type {RoutingInfo | null} */ (
      track.getProperty("input_routing_channel")
    );

    result.inputRoutingChannel = inputChannel
      ? {
          name: inputChannel.display_name,
          inputId: String(inputChannel.identifier),
        }
      : null;
  } else if (category === "return") {
    result.inputRoutingType = null;
    result.inputRoutingChannel = null;
  }

  const outputType = /** @type {RoutingInfo | null} */ (
    track.getProperty("output_routing_type")
  );

  result.outputRoutingType = outputType
    ? {
        name: outputType.display_name,
        outputId: String(outputType.identifier),
      }
    : null;

  const outputChannel = /** @type {RoutingInfo | null} */ (
    track.getProperty("output_routing_channel")
  );

  result.outputRoutingChannel = outputChannel
    ? {
        name: outputChannel.display_name,
        outputId: String(outputChannel.identifier),
      }
    : null;

  if (canBeArmed) {
    const monitoringStateValue = /** @type {number} */ (
      track.getProperty("current_monitoring_state")
    );

    result.monitoringState =
      {
        [LIVE_API_MONITORING_STATE_IN]: MONITORING_STATE.IN,
        [LIVE_API_MONITORING_STATE_AUTO]: MONITORING_STATE.AUTO,
        [LIVE_API_MONITORING_STATE_OFF]: MONITORING_STATE.OFF,
      }[monitoringStateValue] ?? "unknown";
  }

  return result;
}

/**
 * Process available routing options for a track
 * @param {LiveAPI} track - Track object
 * @param {string} category - Track category (regular, return, or master)
 * @param {boolean} isGroup - Whether the track is a group track
 * @returns {object} - Available routing options
 */
export function processAvailableRouting(track, category, isGroup) {
  if (category === "master") {
    return {
      availableInputRoutingTypes: [],
      availableInputRoutingChannels: [],
      availableOutputRoutingTypes: [],
      availableOutputRoutingChannels: [],
    };
  }

  /** @type {Record<string, unknown>} */
  const result = {};

  if (!isGroup && category === "regular") {
    const availableInputTypes = /** @type {RoutingInfo[]} */ (
      track.getProperty("available_input_routing_types") || []
    );

    result.availableInputRoutingTypes = availableInputTypes.map((type) => ({
      name: type.display_name,
      inputId: String(type.identifier),
    }));

    const availableInputChannels = /** @type {RoutingInfo[]} */ (
      track.getProperty("available_input_routing_channels") || []
    );

    result.availableInputRoutingChannels = availableInputChannels.map((ch) => ({
      name: ch.display_name,
      inputId: String(ch.identifier),
    }));
  } else if (category === "return") {
    result.availableInputRoutingTypes = [];
    result.availableInputRoutingChannels = [];
  }

  const availableOutputTypes = /** @type {RoutingInfo[]} */ (
    track.getProperty("available_output_routing_types") || []
  );

  result.availableOutputRoutingTypes = availableOutputTypes.map((type) => ({
    name: type.display_name,
    outputId: String(type.identifier),
  }));

  const availableOutputChannels = /** @type {RoutingInfo[]} */ (
    track.getProperty("available_output_routing_channels") || []
  );

  result.availableOutputRoutingChannels = availableOutputChannels.map((ch) => ({
    name: ch.display_name,
    outputId: String(ch.identifier),
  }));

  return result;
}
