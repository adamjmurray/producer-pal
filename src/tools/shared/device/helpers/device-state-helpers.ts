// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { midiToNoteName } from "#src/shared/pitch.ts";
import {
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  STATE,
} from "#src/tools/constants.ts";
import { readChainMixer } from "./chain-mixer-helpers.ts";

export interface BuildChainInfoOptions {
  path?: string | null;
  devices?: Record<string, unknown>[];
  deviceCount?: number;
}

/**
 * Build chain info object with standard properties
 * @param chain - Chain Live API object
 * @param options - Build options
 * @returns Chain info object with id, path, type, name, color, mappedPitch,
 *   chokeGroup, non-default mixer settings (gainDb, pan, sends), and state
 */
export function buildChainInfo(
  chain: LiveAPI,
  options: BuildChainInfoOptions = {},
): Record<string, unknown> {
  const { path, devices, deviceCount } = options;

  const chainInfo: Record<string, unknown> = {
    id: chain.id,
  };

  if (path) {
    chainInfo.path = path;
  }

  // chain.type returns "Chain" or "DrumChain" from Live API
  chainInfo.type = chain.type;
  chainInfo.name = chain.getProperty("name");

  const color = chain.getColor();

  if (color) {
    chainInfo.color = color;
  }

  // DrumChain-only properties: mappedPitch and chokeGroup
  if (chain.type === "DrumChain") {
    // out_note is the MIDI pitch sent to the instrument
    const outNote = chain.getProperty("out_note") as number | null;

    if (outNote != null) {
      const noteName = midiToNoteName(outNote);

      if (noteName != null) {
        chainInfo.mappedPitch = noteName;
      }
    }

    const chokeGroup = chain.getProperty("choke_group") as number;

    if (chokeGroup > 0) {
      chainInfo.chokeGroup = chokeGroup;
    }
  }

  Object.assign(chainInfo, readChainMixer(chain));

  const chainState = computeState(chain);

  if (chainState !== STATE.ACTIVE) {
    chainInfo.state = chainState;
  }

  if (devices !== undefined) {
    chainInfo.devices = devices;
  } else if (deviceCount !== undefined) {
    chainInfo.deviceCount = deviceCount;
  }

  return chainInfo;
}

/**
 * Compute the state of a Live object based on mute/solo properties
 * @param liveObject - Live API object
 * @param category - Category type (default "regular")
 * @returns State value
 */
export function computeState(
  liveObject: LiveAPI,
  category = "regular",
): string {
  if (category === "master") {
    return STATE.ACTIVE;
  }

  const isMuted = (liveObject.getProperty("mute") as number) > 0;
  const isSoloed = (liveObject.getProperty("solo") as number) > 0;
  const isMutedViaSolo =
    (liveObject.getProperty("muted_via_solo") as number) > 0;

  if (isMuted && isSoloed) {
    return STATE.MUTED_AND_SOLOED;
  }

  if (isSoloed) {
    return STATE.SOLOED;
  }

  if (isMuted && isMutedViaSolo) {
    return STATE.MUTED_ALSO_VIA_SOLO;
  }

  if (isMutedViaSolo) {
    return STATE.MUTED_VIA_SOLO;
  }

  if (isMuted) {
    return STATE.MUTED;
  }

  return STATE.ACTIVE;
}

/**
 * Whether a device makes sound — an instrument, or a rack with one inside.
 * Live types a rack as an instrument whether or not it holds anything, so an
 * empty one has to be looked into: otherwise a silent pad is listed in the drum
 * map as playable. Reads Live directly rather than the processed tree, so the
 * answer is the same however deep the rack sits.
 * @param device - Device LiveAPI object
 * @returns True if the device, or something nested in it, is an instrument
 */
export function deviceHasInstrument(device: LiveAPI): boolean {
  if (device.getProperty("type") !== LIVE_API_DEVICE_TYPE_INSTRUMENT) {
    return false;
  }

  if (!device.getProperty("can_have_chains")) {
    return true;
  }

  return device
    .getChildren("chains")
    .some((chain) => chain.getChildren("devices").some(deviceHasInstrument));
}
