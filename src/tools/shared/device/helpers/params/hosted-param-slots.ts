// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A hosted plug-in param that an automation slot drives reads with the slot and,
// like any param, its arrangement automation. Params no slot drives read as
// they always did.

import {
  noteAutomationUnknown,
  owningTrackFollowsArrangement,
} from "#src/tools/shared/arrangement/tracks/follows-arrangement.ts";
import { type EntryWithDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { AUTOMATION_STATE_MAP } from "../param-reading.ts";
import {
  readSlotMap,
  slotName,
  slotParameters,
  type MappedSlot,
} from "./hosted-automation-slots.ts";
import {
  type HostedParamRead,
  hostedParamId,
} from "./hosted-plugin-reading.ts";

/** A hosted param, with the slot that drives it when one does. */
export interface SlottedParamRead extends HostedParamRead {
  /** The wrapper's automation slot, like "Automation 002" */
  slot?: string;
  /** Arrangement automation, as on any param; read with values only */
  automation?: string;
}

/**
 * Add the slot, and the automation on it, to the params a slot drives.
 * @param device - The wrapper device
 * @param parameters - The plug-in's params that a read lists
 * @param includeValues - Whether the read gives values, and so automation
 * @param deviceInfo - The device's entry, which says when automation is unknown
 * @returns The same params, the driven ones with their slot
 */
export function markSlottedParams(
  device: LiveAPI,
  parameters: HostedParamRead[],
  includeValues: boolean,
  deviceInfo: EntryWithDetail,
): SlottedParamRead[] {
  const read = readSlotMap(device.id);

  if (!read.ok || read.slots.mapped.size === 0) {
    return parameters;
  }

  const byId = new Map<string, MappedSlot>();

  for (const entry of read.slots.mapped.values()) {
    byId.set(hostedParamId(entry.index), entry);
  }

  // Params no slot drives stay as they were: the read adds nothing for them.
  const driven = parameters.map((param) => byId.get(param.id));
  const automation = includeValues
    ? automationBySlot(device, driven, deviceInfo)
    : new Map<number, string>();

  return parameters.map((param, i) => {
    const entry = driven[i];

    if (entry == null) {
      return param;
    }

    const state = automation.get(entry.slot);

    return {
      ...param,
      slot: slotName(entry.slot),
      ...(state != null && { automation: state }),
    };
  });
}

// --- Helpers below main exports ---

/**
 * Read the automation of the slots a list of params uses.
 * @param device - The wrapper device
 * @param driven - What drives each listed param, if a slot does
 * @param deviceInfo - The device's entry, told when the state can't be known
 * @returns The state of each slot that has automation, by slot number
 */
function automationBySlot(
  device: LiveAPI,
  driven: (MappedSlot | undefined)[],
  deviceInfo: EntryWithDetail,
): Map<number, string> {
  const states = new Map<number, string>();

  if (!driven.some((entry) => entry != null)) {
    return states;
  }

  // Same as any param: unknown, and left out, while the track plays from Session.
  if (!owningTrackFollowsArrangement(device)) {
    noteAutomationUnknown(deviceInfo);

    return states;
  }

  const params = slotParameters(device);

  for (const entry of driven) {
    const state =
      entry == null
        ? undefined
        : AUTOMATION_STATE_MAP[
            params
              .get(entry.slot)
              ?.param.getProperty("automation_state") as number
          ];

    if (entry != null && state != null && state !== "none") {
      states.set(entry.slot, state);
    }
  }

  return states;
}
