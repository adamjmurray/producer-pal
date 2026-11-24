// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  detectHostedPlugin,
  type HostedPlugin,
  WRAPPER_CLASSES,
} from "#src/tools/shared/device/helpers/params/hosted-plugin-reading.ts";
import {
  readSlotMap,
  slotParameters,
  type SlotMap,
} from "#src/tools/shared/device/helpers/params/hosted-automation-slots.ts";
import { anyIsProducerPalDeviceItself } from "#src/tools/shared/device/is-producer-pal-device.ts";

/**
 * Classes shared by many unrelated devices: every VST, every AU, every Max
 * device of a kind. The class alone doesn't say two of them are the same.
 */
const SHARED_CLASSES = new Set([
  "PluginDevice",
  "AuPluginDevice",
  "MxDeviceAudioEffect",
  "MxDeviceInstrument",
  "MxDeviceMidiEffect",
]);

/**
 * Why one device's settings can't go onto another because of what they are,
 * when they can't. Built-in devices match by class. A plug-in or Max device
 * must also share its type name and list the same params in the same order,
 * and a plug-in host wrapper must host the same plug-in with the same slots.
 * @param source - The device to copy from
 * @param target - The device to copy onto
 * @returns The reason, or null when the types match
 */
export function copyTypeRefusal(
  source: LiveAPI,
  target: LiveAPI,
): string | null {
  if (anyIsProducerPalDeviceItself(source, target)) {
    return "the Producer Pal device can't be copied from or onto";
  }

  const className = source.getProperty("class_name");

  if (className !== target.getProperty("class_name")) {
    return typeNames(source, target);
  }

  if (!SHARED_CLASSES.has(String(className))) {
    return null;
  }

  if (deviceType(source) !== deviceType(target)) {
    return typeNames(source, target);
  }

  if (!sameNames(paramNames(source), paramNames(target))) {
    return `both are ${deviceType(source)}, but they list different params`;
  }

  return wrapperRefusal(source, target);
}

// --- Helpers below main export ---

/**
 * @param source - The device to copy from
 * @param target - The device to copy onto
 * @returns "the source is X, not Y"
 */
function typeNames(source: LiveAPI, target: LiveAPI): string {
  return `the source is ${deviceType(source)}, not ${deviceType(target)}`;
}

/**
 * A device's type in the words the tools use. Not its `name`, which the user
 * can change.
 * @param device - The device
 * @returns Its display name, or its class name when it has none
 */
function deviceType(device: LiveAPI): string {
  return String(
    device.getProperty("class_display_name") ??
      device.getProperty("class_name"),
  );
}

/**
 * @param a - One list of param names
 * @param b - Another
 * @returns Whether both hold the same names in the same order
 */
export function sameNames(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

/**
 * @param device - A device
 * @returns Its param names, in order
 */
function paramNames(device: LiveAPI): string[] {
  return device.getChildren("parameters").map((param) => param.getName());
}

/**
 * Plug-in host wrappers list the same Live params whatever they host, and map
 * each slot to a plug-in param their own way, so the slots decide. A wrapper
 * that hasn't answered can't say what it hosts, and is told by its slot params.
 * @param source - The device to copy from
 * @param target - The device to copy onto
 * @returns The reason, or null when neither is a wrapper or both match
 */
function wrapperRefusal(source: LiveAPI, target: LiveAPI): string | null {
  const from = detectHostedPlugin(source);
  const onto = detectHostedPlugin(target);

  if (
    from == null &&
    onto == null &&
    !hasSlotParams(source) &&
    !hasSlotParams(target)
  ) {
    return null;
  }

  const refusal = unansweredRefusal(from, onto) ?? unloadedRefusal(from, onto);

  if (refusal != null) {
    return refusal;
  }

  const [fromLabel, ontoLabel] = [from?.label, onto?.label];

  if (fromLabel !== ontoLabel) {
    return `the source hosts ${fromLabel}, not ${ontoLabel}`;
  }

  return slotRefusal(source, target, String(fromLabel));
}

/**
 * @param device - A device
 * @returns Whether it has the numbered slot params a wrapper has
 */
function hasSlotParams(device: LiveAPI): boolean {
  const className = device.getProperty("class_name");

  return (
    typeof className === "string" &&
    WRAPPER_CLASSES.has(className) &&
    slotParameters(device).size > 0
  );
}

/**
 * @param from - What the source's wrapper said it hosts
 * @param onto - What the target's said
 * @returns The reason when either gave no answer, else null
 */
function unansweredRefusal(
  from: HostedPlugin | null,
  onto: HostedPlugin | null,
): string | null {
  if (from == null && onto == null) {
    return "neither plug-in host answered";
  }

  if (from == null || onto == null) {
    return `the ${from == null ? "source" : "target"} plug-in host didn't answer`;
  }

  return null;
}

/**
 * @param from - What the source's wrapper said it hosts
 * @param onto - What the target's said
 * @returns The reason when either hosts no plug-in, else null
 */
function unloadedRefusal(
  from: HostedPlugin | null,
  onto: HostedPlugin | null,
): string | null {
  if (from?.label == null && onto?.label == null) {
    return "neither plug-in host has a plug-in loaded";
  }

  if (from?.label == null || onto?.label == null) {
    return `the ${from?.label == null ? "source" : "target"} plug-in host has no plug-in loaded`;
  }

  return null;
}

/**
 * @param source - The wrapper to copy from
 * @param target - The wrapper to copy onto
 * @param plugin - The plug-in both host
 * @returns The reason, or null when every slot drives the same plug-in param
 *   on both
 */
function slotRefusal(
  source: LiveAPI,
  target: LiveAPI,
  plugin: string,
): string | null {
  const from = readSlotMap(source.id);
  const onto = readSlotMap(target.id);

  if (!from.ok) {
    return `the source's slots can't be read: ${from.reason}`;
  }

  if (!onto.ok) {
    return `the target's slots can't be read: ${onto.reason}`;
  }

  return sameMap(from.slots, onto.slots)
    ? null
    : `the two ${plugin} hosts map their slots to different plug-in params`;
}

/**
 * @param a - One wrapper's slots
 * @param b - The other's
 * @returns Whether both have as many slots, each driving the same param
 */
function sameMap(a: SlotMap, b: SlotMap): boolean {
  return (
    a.count === b.count &&
    a.mapped.size === b.mapped.size &&
    [...a.mapped].every(
      ([slot, entry]) => b.mapped.get(slot)?.index === entry.index,
    )
  );
}
