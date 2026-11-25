// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  noteAutomationUnknown,
  owningTrackFollowsArrangement,
} from "#src/tools/shared/arrangement/tracks/follows-arrangement.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { markSlottedParams } from "./hosted-param-slots.ts";
import { readHostedParams } from "./hosted-plugin-reading.ts";
import {
  applySpecializedInactiveStates,
  readSpecializedParams,
} from "../../specialized/specialized-device-registry.ts";
import { readDeviceParameters } from "../device-reading.ts";
import { shareOptionLists } from "./param-option-lists.ts";
import { noteParamsPaged } from "./param-read-cap.ts";

/**
 * Append DeviceParameters and specialized pseudo-params to a device info object.
 * The pseudo-params come on the first page only.
 * @param device - LiveAPI device object
 * @param deviceInfo - Device info object to mutate
 * @param includeValues - Whether to include current param values
 * @param paramSearch - Optional case-insensitive name filter
 * @param paramOffset - Matches to skip before the page
 */
export function appendParameters(
  device: LiveAPI,
  deviceInfo: Record<string, unknown>,
  includeValues: boolean,
  paramSearch: string | undefined,
  paramOffset = 0,
): void {
  // `automation` is only read with values, and the track is checked once here
  // rather than once per param.
  const showAutomation =
    !includeValues || owningTrackFollowsArrangement(device);
  const { parameters, total } = readDeviceParameters(device, {
    includeValues,
    search: paramSearch,
    offset: paramOffset,
    showAutomation,
    hideMacrosAbove: macrosToHide(deviceInfo),
  });

  if (!showAutomation) {
    noteAutomationUnknown(deviceInfo);
  }

  const pseudoParams =
    paramOffset === 0 ? readSpecializedParams(device, paramSearch) : [];
  const merged = [...pseudoParams, ...parameters];

  // Mark mode-gated params inactive where Live leaves them active (e.g. a
  // synced LFO's free-running Hz rate). Only meaningful with values, since
  // `state` is value-level.
  if (includeValues) {
    // Off the first page the rules' controllers may be missing from the list,
    // as after a search.
    applySpecializedInactiveStates(
      device,
      merged,
      Boolean(paramSearch) || paramOffset > 0,
    );

    // Before `parameters`, so a reader meets the lists first.
    const optionLists = shareOptionLists(merged);

    if (optionLists != null) {
      deviceInfo.optionLists = optionLists;
    }
  }

  deviceInfo.parameters = merged;
  noteParamsPaged(deviceInfo, total, paramOffset);
}

/**
 * The macro count above which a rack's macros can be left out of its read: when
 * nothing is mapped, every macro beyond the visible count is noise. A rack with
 * mappings waits for the remote script to say which ones.
 * @param deviceInfo - Device info with `macros` set, for a rack
 * @returns The visible macro count, or undefined to leave every macro in
 */
function macrosToHide(deviceInfo: Record<string, unknown>): number | undefined {
  const macros = deviceInfo.macros as
    | { count: number; hasMappings?: boolean }
    | undefined;

  return macros?.hasMappings === false ? macros.count : undefined;
}

/**
 * Append a hosted plug-in's own params to a device info object. They carry
 * `h` ids and values as the plug-in displays them, and the slot that automates
 * them when one does.
 * @param device - The wrapper device
 * @param deviceInfo - Device info object to mutate
 * @param includeValues - Whether to include current param values
 * @param paramSearch - Optional case-insensitive name filter
 * @param paramOffset - Matches to skip before the page
 */
export function appendHostedParameters(
  device: LiveAPI,
  deviceInfo: Record<string, unknown>,
  includeValues: boolean,
  paramSearch: string | undefined,
  paramOffset = 0,
): void {
  const hostedParams = readHostedParams(
    device,
    includeValues,
    paramSearch,
    paramOffset,
  );

  if (hostedParams == null) {
    deviceInfo.parameters = [];
    appendDetail(deviceInfo, "the plug-in's params could not be read");

    return;
  }

  deviceInfo.parameters = markSlottedParams(
    device,
    hostedParams.parameters,
    includeValues,
    deviceInfo,
  );
  noteParamsPaged(deviceInfo, hostedParams.total, paramOffset);
}
