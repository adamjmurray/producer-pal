import {
  LIVE_API_MONITORING_STATE_AUTO,
  LIVE_API_MONITORING_STATE_IN,
  LIVE_API_MONITORING_STATE_OFF,
  MONITORING_STATE,
} from "../constants.js";

/**
 * Process current routing settings for a track
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
  const result = {};
  if (!isGroup && category === "regular") {
    const inputType = track.getProperty("input_routing_type");
    result.inputRoutingType = inputType
      ? {
          name: inputType.display_name,
          inputId: String(inputType.identifier),
        }
      : null;
    const inputChannel = track.getProperty("input_routing_channel");
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
  const outputType = track.getProperty("output_routing_type");
  result.outputRoutingType = outputType
    ? {
        name: outputType.display_name,
        outputId: String(outputType.identifier),
      }
    : null;
  const outputChannel = track.getProperty("output_routing_channel");
  result.outputRoutingChannel = outputChannel
    ? {
        name: outputChannel.display_name,
        outputId: String(outputChannel.identifier),
      }
    : null;
  if (canBeArmed) {
    const monitoringStateValue = track.getProperty("current_monitoring_state");
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
  const result = {};
  if (!isGroup && category === "regular") {
    const availableInputTypes =
      track.getProperty("available_input_routing_types") || [];
    result.availableInputRoutingTypes = availableInputTypes.map((type) => ({
      name: type.display_name,
      inputId: String(type.identifier),
    }));
    const availableInputChannels =
      track.getProperty("available_input_routing_channels") || [];
    result.availableInputRoutingChannels = availableInputChannels.map((ch) => ({
      name: ch.display_name,
      inputId: String(ch.identifier),
    }));
  } else if (category === "return") {
    result.availableInputRoutingTypes = [];
    result.availableInputRoutingChannels = [];
  }
  const availableOutputTypes =
    track.getProperty("available_output_routing_types") || [];
  result.availableOutputRoutingTypes = availableOutputTypes.map((type) => ({
    name: type.display_name,
    outputId: String(type.identifier),
  }));
  const availableOutputChannels =
    track.getProperty("available_output_routing_channels") || [];
  result.availableOutputRoutingChannels = availableOutputChannels.map((ch) => ({
    name: ch.display_name,
    outputId: String(ch.identifier),
  }));
  return result;
}
