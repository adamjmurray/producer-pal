// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { midiToNoteName } from "#src/shared/pitch.ts";
import {
  CHAIN_TYPE,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  STATE,
} from "#src/tools/constants.ts";
import {
  noteAutomationUnknown,
  owningTrackFollowsArrangement,
} from "#src/tools/shared/arrangement/tracks/follows-arrangement.ts";
import { automatedFieldNames } from "#src/tools/shared/arrangement/tracks/automated-fields.ts";
import { readChainMixerAndParams } from "./chain-mixer/chain-mixer.ts";

// Live allows one instrument per chain, and says so by refusing the write
// without a reason. Shared so a move and a create name the same cause.
export const ONE_INSTRUMENT_PER_CHAIN =
  "the destination already has an instrument, and only one is allowed";

export interface BuildChainInfoOptions {
  path?: string | null;
  devices?: Record<string, unknown>[];
  deviceCount?: number;
  /**
   * True to name the mixer fields that have an arrangement lane. The caller
   * checks that the chain's track follows the arrangement, once for all its
   * chains, and says so itself when it doesn't. Default false.
   */
  showAutomation?: boolean;
}

/**
 * Build chain info object with standard properties
 * @param chain - Chain Live API object
 * @param options - Build options
 * @returns Chain info object with id, path, type, name, color, mappedPitch,
 *   chokeGroup, non-default mixer settings (gainDb, pan, sends), automation
 *   (when asked for), and state
 */
export function buildChainInfo(
  chain: LiveAPI,
  options: BuildChainInfoOptions = {},
): Record<string, unknown> {
  const { path, devices, deviceCount, showAutomation = false } = options;

  const chainInfo: Record<string, unknown> = {
    id: chain.id,
  };

  if (path) {
    chainInfo.path = path;
  }

  chainInfo.type =
    chain.type === "DrumChain" ? CHAIN_TYPE.DRUM_CHAIN : CHAIN_TYPE.CHAIN;
  chainInfo.name = chain.getName();

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

  const { values, automatable } = readChainMixerAndParams(chain);

  Object.assign(chainInfo, values);

  if (showAutomation) {
    const automation = automatedFieldNames(automatable);

    if (automation.length > 0) {
      chainInfo.automation = automation;
    }
  }

  const chainState = computeState(chain);

  if (chainState !== STATE.ACTIVE) {
    chainInfo.state = chainState;
  }

  if (devices != null) {
    chainInfo.devices = devices;
  } else if (deviceCount != null) {
    chainInfo.deviceCount = deviceCount;
  }

  return chainInfo;
}

/**
 * Build the entry for a chain the caller addressed directly, so the chain is
 * the entry that says when its automation is unknown. Checks the chain's track
 * once, and hands the answer to the devices read inside it.
 * @param chain - Chain or DrumChain LiveAPI object
 * @param path - The chain's path in Producer Pal's grammar
 * @param readDevices - Reads the chain's devices; told whether the track follows
 *   the arrangement, to pass on to any rack among them
 * @returns Chain info
 */
export function buildAddressedChainInfo(
  chain: LiveAPI,
  path: string | null,
  readDevices: (chainAutomation: boolean) => Record<string, unknown>[],
): Record<string, unknown> {
  const follows = owningTrackFollowsArrangement(chain);
  const chainInfo = buildChainInfo(chain, {
    path,
    devices: readDevices(follows),
    showAutomation: follows,
  });

  if (!follows) {
    noteAutomationUnknown(chainInfo);
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

  return device.someChild("chains", (chain) =>
    chain.someChild("devices", deviceHasInstrument),
  );
}
