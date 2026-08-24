// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reading a drum pad, or anything reached through one. A pad path can pass
// through several racks, and the rack it lands in may have no pad objects at
// all, so the pad's chains — not its `drum_pads` entry — are what every step
// resolves against.

import { assertDefined } from "#src/shared/error-utils.ts";
import { midiToNoteName, noteNameToMidi } from "#src/shared/pitch.ts";
import { STATE } from "#src/tools/constants.ts";
import { readDevice as readDeviceShared } from "#src/tools/shared/device/device-reader.ts";
import { buildChainInfo } from "#src/tools/shared/device/helpers/device-reader-helpers.ts";
import {
  chainsForInNote,
  chainsOnDrumPad,
  findDrumPadByNote,
  navigateRemainingSegments,
} from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { type ReadOptions } from "./read-device-options.ts";

/**
 * Read drum pad by path
 * @param liveApiPath - Live API path to parent device
 * @param drumPadNote - Note name of the drum pad (e.g., "C1")
 * @param remainingSegments - Segments after drum pad in path
 * @param fullPath - Full simplified path for response
 * @param options - Read options
 * @returns Drum pad, chain, or device information
 */
export function readDrumPadByPath(
  liveApiPath: string,
  drumPadNote: string,
  remainingSegments: string[],
  fullPath: string,
  options: ReadOptions,
): Record<string, unknown> {
  const device = LiveAPI.from(liveApiPath);

  if (!device.exists()) {
    throw new Error(`Device not found at path: ${liveApiPath}`);
  }

  // The grammar already validated the note, so this always converts; the
  // catch-all is in_note -1.
  const midiNote =
    drumPadNote === "*" ? -1 : (noteNameToMidi(drumPadNote) as number);
  // Two kinds of pad have no DrumPad object: the catch-all, which is a chain
  // group rather than a drum_pads entry, and every pad of a Drum Rack nested in
  // a drum pad, because such a rack has no pads at all (see
  // dev/Coding-Standards.md). Both still route chains, and read-device prints
  // paths through them, so those paths have to read back.
  const pad = midiNote < 0 ? null : findDrumPadByNote(device, midiNote);
  const chains = pad ? chainsOnDrumPad(pad) : chainsForInNote(device, midiNote);

  if (pad == null && chains.length === 0) {
    throw new Error(`Drum pad ${drumPadNote} not found`);
  }

  if (remainingSegments.length > 0) {
    return readDrumPadNestedTarget(
      chains,
      remainingSegments,
      fullPath,
      options,
    );
  }

  return pad
    ? buildDrumPadInfo(pad, fullPath, options)
    : buildPadlessDrumPadInfo(chains, midiNote, fullPath, options);
}

/**
 * Navigate into drum pad chains based on remaining path segments. The chain
 * segment is optional: a leading `c<N>` selects a chain, while a leading `d<N>`
 * implies chain 0 (so `pC1/d0` == `pC1/c0/d0`). This mirrors the write-side
 * pad-property shortcut (see resolveNestedParamTarget) so reads and writes
 * accept the same drum-pad paths.
 * @param chains - The pad's chains, in the order its `cN` segments name them
 * @param remainingSegments - Segments after drum pad in path
 * @param fullPath - Full simplified path for response
 * @param options - Read options
 * @returns Chain or device information
 */
function readDrumPadNestedTarget(
  chains: LiveAPI[],
  remainingSegments: string[],
  fullPath: string,
  options: ReadOptions,
): Record<string, unknown> {
  const firstSegment = assertDefined(
    remainingSegments[0],
    "chain or device segment",
  );
  // A leading "c<N>" is an explicit chain index; otherwise chain 0 is implied
  // and the first segment is the device.
  const hasChainSegment = firstSegment.startsWith("c");
  const chainIndex = hasChainSegment
    ? Number.parseInt(firstSegment.slice(1))
    : 0;

  if (
    Number.isNaN(chainIndex) ||
    chainIndex < 0 ||
    chainIndex >= chains.length
  ) {
    throw new Error(`Invalid chain index in path: ${fullPath}`);
  }

  const chain = assertDefined(
    chains[chainIndex],
    `chain at index ${chainIndex}`,
  );

  // The device segment follows the optional chain segment. With no device
  // segment (explicit chain only, e.g. "pC1/c0"), return the chain.
  const deviceSegment = hasChainSegment
    ? remainingSegments[1]
    : remainingSegments[0];

  if (deviceSegment == null) {
    return readDrumPadChain(chain, fullPath, options);
  }

  // Parse device index from prefixed segment (e.g., "d0" -> 0)
  const deviceIndex = Number.parseInt(deviceSegment.slice(1));
  const devices = chain.getChildren("devices");

  if (
    Number.isNaN(deviceIndex) ||
    deviceIndex < 0 ||
    deviceIndex >= devices.length
  ) {
    throw new Error(`Invalid device index in path: ${fullPath}`);
  }

  const device = assertDefined(
    devices[deviceIndex],
    `device at index ${deviceIndex}`,
  );

  // Anything after the device segment points inside it — a nested rack's own
  // pads, chains, or devices. Without this the extra segments were dropped and
  // the outer device came back under the requested path, so a read of a nested
  // pad silently answered with the rack holding it.
  const nested = remainingSegments.slice(hasChainSegment ? 2 : 1);

  if (nested.length > 0) {
    return readNestedTarget(device, nested, fullPath, options);
  }

  return readDeviceShared(device, {
    ...options,
    parentPath: fullPath,
  });
}

/**
 * Read a target further inside a device reached through a drum pad path.
 * Navigation is shared with the write side so both accept the same paths.
 * @param device - Device the remaining segments are relative to
 * @param segments - Segments after the device (c/rc/d/p prefixed)
 * @param fullPath - Full simplified path for the response
 * @param options - Read options
 * @returns Chain or device information
 */
function readNestedTarget(
  device: LiveAPI,
  segments: string[],
  fullPath: string,
  options: ReadOptions,
): Record<string, unknown> {
  const { target, targetType } = navigateRemainingSegments(device, segments);

  if (target == null) {
    throw new Error(`Invalid path: ${fullPath}`);
  }

  if (targetType === "chain") {
    return readDrumPadChain(target, fullPath, options);
  }

  return readDeviceShared(target, { ...options, parentPath: fullPath });
}

/**
 * Read chain within a drum pad
 * @param chain - Chain Live API object
 * @param path - Simplified path for response
 * @param options - Read options
 * @returns Chain information
 */
function readDrumPadChain(
  chain: LiveAPI,
  path: string,
  options: ReadOptions,
): Record<string, unknown> {
  const devices = chain
    .getChildren("devices")
    .map((device: LiveAPI, index: number) => {
      const devicePath = `${path}/d${index}`;

      return readDeviceShared(device, {
        ...options,
        parentPath: devicePath,
      });
    });

  return buildChainInfo(chain, { path, devices });
}

/**
 * Build drum pad info object
 * @param pad - Drum pad Live API object
 * @param path - Simplified path for response
 * @param options - Read options
 * @returns Drum pad information
 */
export function buildDrumPadInfo(
  pad: LiveAPI,
  path: string,
  options: ReadOptions,
): Record<string, unknown> {
  const midiNote = pad.getProperty("note") as number;
  // A pad's note is always 0-127, so it always names.
  const noteName = midiToNoteName(midiNote) as string;
  const isMuted = (pad.getProperty("mute") as number) > 0;
  const isSoloed = (pad.getProperty("solo") as number) > 0;

  const drumPadInfo: Record<string, unknown> = {
    id: pad.id,
    path,
    name: pad.getProperty("name"),
    note: midiNote,
    pitch: noteName,
  };

  if (isSoloed) {
    drumPadInfo.state = STATE.SOLOED;
  } else if (isMuted) {
    drumPadInfo.state = STATE.MUTED;
  }

  // Include chains if requested
  if (options.includeChains || options.includeDrumPads) {
    drumPadInfo.chains = buildDrumPadChains(
      chainsOnDrumPad(pad),
      path,
      options,
    );
  }

  return drumPadInfo;
}

/**
 * Build info for a pad the rack has no DrumPad object for: the catch-all, or any
 * pad of a Drum Rack nested in a drum pad. There is no pad to take an id, a
 * name, or a mute/solo state from, so the chains carry all of it — the same
 * shape the drum-pads tree walk emits for these pads.
 * @param chains - The chains the rack routes to this pad
 * @param midiNote - The pad's MIDI note, or -1 for the catch-all
 * @param path - Simplified path for response
 * @param options - Read options
 * @returns Drum pad information, with no id
 */
function buildPadlessDrumPadInfo(
  chains: LiveAPI[],
  midiNote: number,
  path: string,
  options: ReadOptions,
): Record<string, unknown> {
  const firstChain = assertDefined(chains[0], "chain routed to the pad");

  const drumPadInfo: Record<string, unknown> = {
    path,
    name: firstChain.getProperty("name"),
    note: midiNote,
    pitch: midiNote < 0 ? "*" : midiToNoteName(midiNote),
  };

  if (options.includeChains || options.includeDrumPads) {
    drumPadInfo.chains = buildDrumPadChains(chains, path, options);
  }

  return drumPadInfo;
}

/**
 * Build the chain info a drum pad carries, each under its own `cN` path.
 * @param chains - The pad's chains, in the order its `cN` segments name them
 * @param path - The pad's simplified path
 * @param options - Read options
 * @returns One chain info per chain
 */
function buildDrumPadChains(
  chains: LiveAPI[],
  path: string,
  options: ReadOptions,
): Record<string, unknown>[] {
  return chains.map((chain: LiveAPI, chainIndex: number) => {
    const chainPath = `${path}/c${chainIndex}`;
    const devices = chain
      .getChildren("devices")
      .map((device: LiveAPI, deviceIndex: number) =>
        readDeviceShared(device, {
          ...options,
          parentPath: `${chainPath}/d${deviceIndex}`,
        }),
      );

    return buildChainInfo(chain, { path: chainPath, devices });
  });
}
