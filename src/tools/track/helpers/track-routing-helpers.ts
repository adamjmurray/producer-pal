// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  LIVE_API_MONITORING_STATE_AUTO,
  LIVE_API_MONITORING_STATE_IN,
  LIVE_API_MONITORING_STATE_OFF,
  MONITORING_STATE,
} from "#src/tools/constants.ts";

interface RoutingInfo {
  display_name: string;
  identifier: string | number;
}

interface InputRoutingResult {
  name: string;
  inputId: string;
}

interface OutputRoutingResult {
  name: string;
  outputId: string;
}

interface CurrentRoutingResult {
  inputRoutingType: InputRoutingResult | null;
  inputRoutingChannel: InputRoutingResult | null;
  outputRoutingType: OutputRoutingResult | null;
  outputRoutingChannel: OutputRoutingResult | null;
  monitoringState?: string;
}

interface AvailableRoutingResult {
  availableInputRoutingTypes: InputRoutingResult[];
  availableInputRoutingChannels: InputRoutingResult[];
  availableOutputRoutingTypes: OutputRoutingResult[];
  availableOutputRoutingChannels: OutputRoutingResult[];
}

/**
 * Process current routing settings for a track
 * @param track - Track object
 * @param category - Track category (regular, return, or master)
 * @param isGroup - Whether the track is a group track
 * @param canBeArmed - Whether the track can be armed
 * @returns Current routing settings
 */
export function processCurrentRouting(
  track: LiveAPI,
  category: string,
  isGroup: boolean,
  canBeArmed: boolean,
): Partial<CurrentRoutingResult> {
  if (category === "master") {
    return {
      inputRoutingType: null,
      inputRoutingChannel: null,
      outputRoutingType: null,
      outputRoutingChannel: null,
    };
  }

  const result: Partial<CurrentRoutingResult> = {};

  if (!isGroup && category === "regular") {
    const inputType = track.getProperty(
      "input_routing_type",
    ) as RoutingInfo | null;

    result.inputRoutingType = inputType
      ? {
          name: inputType.display_name,
          inputId: String(inputType.identifier),
        }
      : null;

    const inputChannel = track.getProperty(
      "input_routing_channel",
    ) as RoutingInfo | null;

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

  const outputType = track.getProperty(
    "output_routing_type",
  ) as RoutingInfo | null;

  result.outputRoutingType = outputType
    ? {
        name: outputType.display_name,
        outputId: String(outputType.identifier),
      }
    : null;

  const outputChannel = track.getProperty(
    "output_routing_channel",
  ) as RoutingInfo | null;

  result.outputRoutingChannel = outputChannel
    ? {
        name: outputChannel.display_name,
        outputId: String(outputChannel.identifier),
      }
    : null;

  if (canBeArmed) {
    const monitoringStateValue = track.getProperty(
      "current_monitoring_state",
    ) as number;

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
 * @param track - Track object
 * @param category - Track category (regular, return, or master)
 * @param isGroup - Whether the track is a group track
 * @returns Available routing options
 */
export function processAvailableRouting(
  track: LiveAPI,
  category: string,
  isGroup: boolean,
): Partial<AvailableRoutingResult> {
  if (category === "master") {
    return {
      availableInputRoutingTypes: [],
      availableInputRoutingChannels: [],
      availableOutputRoutingTypes: [],
      availableOutputRoutingChannels: [],
    };
  }

  const result: Partial<AvailableRoutingResult> = {};

  if (!isGroup && category === "regular") {
    const availableInputTypes = (track.getProperty(
      "available_input_routing_types",
    ) ?? []) as RoutingInfo[];

    result.availableInputRoutingTypes = availableInputTypes.map((type) => ({
      name: type.display_name,
      inputId: String(type.identifier),
    }));

    const availableInputChannels = (track.getProperty(
      "available_input_routing_channels",
    ) ?? []) as RoutingInfo[];

    result.availableInputRoutingChannels = availableInputChannels.map((ch) => ({
      name: ch.display_name,
      inputId: String(ch.identifier),
    }));
  } else if (category === "return") {
    result.availableInputRoutingTypes = [];
    result.availableInputRoutingChannels = [];
  }

  const availableOutputTypes = (track.getProperty(
    "available_output_routing_types",
  ) ?? []) as RoutingInfo[];

  result.availableOutputRoutingTypes = availableOutputTypes.map((type) => ({
    name: type.display_name,
    outputId: String(type.identifier),
  }));

  const availableOutputChannels = (track.getProperty(
    "available_output_routing_channels",
  ) ?? []) as RoutingInfo[];

  result.availableOutputRoutingChannels = availableOutputChannels.map((ch) => ({
    name: ch.display_name,
    outputId: String(ch.identifier),
  }));

  return result;
}
