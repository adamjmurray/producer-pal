// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A hosted plug-in's params can't be automated directly. Its wrapper has
// numbered automation slots ("Automation 001"...), each a Live parameter that
// can drive one plug-in param. Tools map a slot to the param, then automate
// the slot's Live parameter.

import { probePluginHost } from "#src/live-api-adapter/protocols/plugin-host-v8-protocol.ts";
import { trimmedParamName } from "#src/tools/shared/device/helpers/param-reading.ts";

/** A slot's Live parameter name: three digits, since Live sorts names as text. */
const SLOT_PARAMETER_NAME = /^Automation (\d{3})$/;

/** A plug-in param a slot drives. */
export interface MappedSlot {
  slot: number;
  /** The plug-in's number for the param (the first is 1), as in `h56` */
  index: number;
  /** The plug-in param's name */
  name: string;
}

/** What a wrapper's slots drive. */
export interface SlotMap {
  /** How many slots the wrapper has */
  count: number;
  mapped: Map<number, MappedSlot>;
}

/** What a wrapper said to a request: its answer, or why there is none. */
export type SlotOutcome<T> = ({ ok: true } & T) | { ok: false; reason: string };

/** A slot's Live parameter, and its position in the device's parameters. */
export interface SlotParameter {
  param: LiveAPI;
  index: number;
}

/**
 * @param slot - A slot number (the first is 1)
 * @returns The slot's name, like "Automation 002"
 */
export function slotName(slot: number): string {
  return `Automation ${String(slot).padStart(3, "0")}`;
}

/**
 * @param name - A Live parameter name
 * @returns The slot number when the name is a slot's, else null
 */
export function parseSlotName(name: string): number | null {
  const match = SLOT_PARAMETER_NAME.exec(name);

  return match ? Number(match[1]) : null;
}

/**
 * Ask a wrapper which plug-in params its slots drive.
 * @param deviceId - Live id of the wrapper device
 * @returns The slots, or why they can't be read
 */
export function readSlotMap(deviceId: string): SlotOutcome<{ slots: SlotMap }> {
  const reply = probePluginHost(deviceId, "slots");

  if (reply?.success !== true) {
    return { ok: false, reason: refusal(reply?.error, "read") };
  }

  const listed = (reply.slots ?? []) as MappedSlot[];

  return {
    ok: true,
    slots: {
      count: Number(reply.slotCount ?? 0),
      mapped: new Map(listed.map((entry) => [entry.slot, entry])),
    },
  };
}

/**
 * Make a slot drive a plug-in param. A slot that already drives it is left as
 * it is.
 * @param deviceId - Live id of the wrapper device
 * @param slot - The slot number
 * @param index - The plug-in's number for the param
 * @returns The param's name, or why the slot couldn't be mapped
 */
export function mapSlot(
  deviceId: string,
  slot: number,
  index: number,
): SlotOutcome<{ name: string }> {
  const reply = probePluginHost(deviceId, "map", { slot, index });

  return reply?.success === true
    ? { ok: true, name: typeof reply.name === "string" ? reply.name : "" }
    : { ok: false, reason: refusal(reply?.error, "map") };
}

/**
 * Find a wrapper's slot parameters, which Live lists among its parameters.
 * @param device - The wrapper device
 * @returns Each slot's parameter by slot number
 */
export function slotParameters(device: LiveAPI): Map<number, SlotParameter> {
  const found = new Map<number, SlotParameter>();

  for (const [index, param] of device.getChildren("parameters").entries()) {
    const slot = parseSlotName(trimmedParamName(param));

    if (slot != null) {
      found.set(slot, { param, index });
    }
  }

  return found;
}

/**
 * Say why a wrapper didn't do what was asked, in words for the caller.
 * @param error - What the wrapper said, if it answered
 * @param what - "read" the slots or "map" one
 * @returns The reason
 */
function refusal(error: string | undefined, what: "read" | "map"): string {
  if (error == null) {
    return "the hosted plug-in didn't answer";
  }

  // The wrapper can't tell a Set that is still opening from a broken one.
  if (error.includes("still loading")) {
    return "the device is still loading; try again in a moment";
  }

  if (error.startsWith("unknown op")) {
    return "this wrapper is out of date; create the hosted plug-in again";
  }

  return what === "read"
    ? `couldn't read the automation slots: ${error}`
    : `couldn't map an automation slot: ${error}`;
}
