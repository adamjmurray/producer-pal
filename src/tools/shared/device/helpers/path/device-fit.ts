// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Whether a kind of device can go where a path puts it. Live turns a misfit
// down with no id and no reason, so the reason is worked out here.

import { isGroupTrack } from "#src/tools/shared/arrangement/tracks/tracks-inside-group.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
  VALID_DEVICES,
} from "#src/tools/constants.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

export type DeviceKind = "instrument" | "midi-effect" | "audio-effect";

/** What a container takes only, and what to call it. */
interface Restriction {
  place: string;
  only: DeviceKind;
}

const INSTRUMENT: DeviceKind = "instrument";
const MIDI_EFFECT: DeviceKind = "midi-effect";
const AUDIO_EFFECT: DeviceKind = "audio-effect";

const KIND_NAMES: Record<DeviceKind, { one: string; many: string }> = {
  [INSTRUMENT]: { one: "an instrument", many: "instruments" },
  [MIDI_EFFECT]: { one: "a MIDI effect", many: "MIDI effects" },
  [AUDIO_EFFECT]: { one: "an audio effect", many: "audio effects" },
};

const KIND_BY_DEVICE_TYPE: Record<number, DeviceKind> = {
  [LIVE_API_DEVICE_TYPE_INSTRUMENT]: INSTRUMENT,
  [LIVE_API_DEVICE_TYPE_MIDI_EFFECT]: MIDI_EFFECT,
  [LIVE_API_DEVICE_TYPE_AUDIO_EFFECT]: AUDIO_EFFECT,
};

const CHAIN_TAIL = / (?:return_)?chains \d+$/;

/**
 * The kind of a native device, from its name.
 * @param deviceName - The device as the call named it
 * @returns The kind, or null for a name that isn't a native device
 */
export function nativeDeviceKind(deviceName: string): DeviceKind | null {
  if ((VALID_DEVICES.instruments as readonly string[]).includes(deviceName)) {
    return INSTRUMENT;
  }

  if ((VALID_DEVICES.midiEffects as readonly string[]).includes(deviceName)) {
    return MIDI_EFFECT;
  }

  return (VALID_DEVICES.audioEffects as readonly string[]).includes(deviceName)
    ? AUDIO_EFFECT
    : null;
}

/**
 * The kind of a browser item, from the type the remote script gave it.
 * @param itemType - The item's `type`
 * @returns The kind, or null for a plug-in, preset or other item that says none
 */
export function browserItemKind(itemType: string): DeviceKind | null {
  return itemType === INSTRUMENT ||
    itemType === MIDI_EFFECT ||
    itemType === AUDIO_EFFECT
    ? itemType
    : null;
}

/**
 * The kind of a device that is already in the Set.
 * @param device - The device
 * @returns The kind, or null when Live reports none
 */
export function loadedDeviceKind(device: LiveAPI): DeviceKind | null {
  return KIND_BY_DEVICE_TYPE[device.getProperty("type") as number] ?? null;
}

/**
 * Why a track won't take a device, for a track that takes only audio effects.
 * Cheap enough to ask before every insert: a chain isn't asked, since that
 * takes building its rack.
 * @param deviceName - The device as the call named it
 * @param kind - The device's kind, or null when it isn't known
 * @param container - The track or chain it is headed for
 * @returns The reason, or null when the container takes it, is a chain, or the
 *   kind is unknown
 */
export function trackMisfitReason(
  deviceName: string,
  kind: DeviceKind | null,
  container: LiveAPI,
): string | null {
  return kind == null || isChain(container)
    ? null
    : misfitReason(deviceName, kind, container);
}

/**
 * Why a track or chain won't take a device, for a place that takes only one
 * kind. For after Live has refused it.
 * @param deviceName - The device as the call named it
 * @param kind - The device's kind, or null when it isn't known
 * @param container - The track or chain it was headed for
 * @returns The reason, or null when the container takes it, or nothing says
 *   it can't
 */
export function misfitReason(
  deviceName: string,
  kind: DeviceKind | null,
  container: LiveAPI,
): string | null {
  const restriction = restrictionOf(container, kind);

  if (restriction == null || kind === restriction.only) {
    return null;
  }

  const what =
    kind == null
      ? `"${deviceName}" may not be ${KIND_NAMES[restriction.only].one}`
      : `"${deviceName}" is ${KIND_NAMES[kind].one}`;

  return `${restriction.place} ${targetLabel(container)} takes only ${KIND_NAMES[restriction.only].many}; ${what}`;
}

// What a container takes only, or null when it takes every kind. A track always
// takes an audio effect, so it isn't read for one.
function restrictionOf(
  container: LiveAPI,
  kind: DeviceKind | null,
): Restriction | null {
  if (isChain(container)) {
    return chainRestriction(container);
  }

  return kind === AUDIO_EFFECT ? null : trackRestriction(container);
}

function isChain(container: LiveAPI): boolean {
  return CHAIN_TAIL.test(container.path);
}

// What a track takes only, or null when it takes every kind.
function trackRestriction(container: LiveAPI): Restriction | null {
  const { category } = container;

  if (category === "return") {
    return { place: "return track", only: AUDIO_EFFECT };
  }

  if (category === "master") {
    return { place: "main track", only: AUDIO_EFFECT };
  }

  if (isGroupTrack(container)) {
    return { place: "group track", only: AUDIO_EFFECT };
  }

  // A group reports no MIDI input too, so it is told apart first.
  return (container.getProperty("has_midi_input") as number) > 0
    ? null
    : { place: "audio track", only: AUDIO_EFFECT };
}

// Only an audio or MIDI effect rack limits its chains; the others take all.
function chainRestriction(chain: LiveAPI): Restriction | null {
  const rack = LiveAPI.from(chain.path.replace(CHAIN_TAIL, ""));
  const only = loadedDeviceKind(rack);

  return only === AUDIO_EFFECT || only === MIDI_EFFECT
    ? { place: "chain", only }
    : null;
}
