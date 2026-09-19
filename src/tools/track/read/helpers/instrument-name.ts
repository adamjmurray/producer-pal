// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEVICE_TYPE } from "#src/tools/constants.ts";
import {
  DEFAULT_MAX_DEPTH,
  getDeviceType,
} from "#src/tools/shared/device/device-reader.ts";

/** How many inner instruments are named before the rest become a count. */
const MAX_LISTED_NAMES = 4;

/**
 * Name the instrument a track plays.
 *
 * An Instrument Rack names what is inside it — "Instrument Rack (Operator,
 * Wavetable)" — because "Instrument Rack" alone says nothing about what makes
 * the sound. A Drum Rack stays "Drum Rack": its pads are the detail, and the
 * drum map already carries them.
 *
 * @param devices - The track's devices, in order
 * @returns The instrument's name, or null when the track has no instrument
 */
export function getInstrumentName(devices: LiveAPI[]): string | null {
  for (const device of devices) {
    const deviceType = getDeviceType(device);

    if (
      deviceType === DEVICE_TYPE.INSTRUMENT ||
      deviceType === DEVICE_TYPE.DRUM_RACK
    ) {
      return className(device);
    }

    if (deviceType === DEVICE_TYPE.INSTRUMENT_RACK) {
      const inner = rackInstrumentNames(device, 1);

      return inner.length === 0
        ? className(device)
        : `${className(device)} (${formatNames(inner)})`;
    }
  }

  return null;
}

/**
 * The distinct innermost instrument names reachable through a rack's chains,
 * in first-seen order.
 * @param rack - Instrument Rack device
 * @param depth - Rack nesting levels already descended
 * @returns Instrument names, empty when no chain plays anything
 */
function rackInstrumentNames(rack: LiveAPI, depth: number): string[] {
  const names: string[] = [];

  for (const chain of rack.getChildren("chains")) {
    for (const name of chainInstrumentNames(chain, depth)) {
      if (!names.includes(name)) {
        names.push(name);
      }
    }
  }

  return names;
}

/**
 * The innermost instrument names behind one chain's first instrument.
 * @param chain - Rack chain
 * @param depth - Rack nesting levels already descended
 * @returns Instrument names, empty when the chain plays nothing
 */
function chainInstrumentNames(chain: LiveAPI, depth: number): string[] {
  // Built one at a time: Live allows one instrument per chain, so the first
  // one ends the search whether or not it turned out to play anything, and
  // whatever sits behind it is never built.
  for (const id of chain.getChildIds("devices")) {
    const names = deviceInstrumentNames(LiveAPI.from(id), depth);

    if (names != null) {
      return names;
    }
  }

  return [];
}

/**
 * What one device inside a rack contributes to the instrument list.
 * @param device - Device on a rack chain
 * @param depth - Rack nesting levels already descended
 * @returns Names, empty for an instrument-less rack, or null when the device
 *   is not an instrument at all
 */
function deviceInstrumentNames(
  device: LiveAPI,
  depth: number,
): string[] | null {
  const deviceType = getDeviceType(device);

  if (
    deviceType === DEVICE_TYPE.INSTRUMENT ||
    deviceType === DEVICE_TYPE.DRUM_RACK
  ) {
    return [className(device)];
  }

  if (deviceType !== DEVICE_TYPE.INSTRUMENT_RACK) {
    return null;
  }

  // The depth cap keeps a pathological Set from walking forever; a rack that
  // deep is named as itself rather than looked into.
  return depth >= DEFAULT_MAX_DEPTH
    ? [className(device)]
    : rackInstrumentNames(device, depth + 1);
}

/**
 * A device's Live class name, e.g. "Operator" or "Instrument Rack"
 * @param device - Device object
 * @returns The class display name
 */
function className(device: LiveAPI): string {
  return device.getProperty("class_display_name") as string;
}

/**
 * Join instrument names, capping the list with a count of what's left.
 * @param names - Distinct instrument names in first-seen order
 * @returns e.g. "Operator, Wavetable" or "A, B, C, D, +3"
 */
function formatNames(names: string[]): string {
  const listed = names.slice(0, MAX_LISTED_NAMES).join(", ");

  return names.length <= MAX_LISTED_NAMES
    ? listed
    : `${listed}, +${String(names.length - MAX_LISTED_NAMES)}`;
}
