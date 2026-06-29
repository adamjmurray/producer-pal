// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { assertDefined } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { DEVICE_CLASS } from "#src/tools/constants.ts";
import { resolveOrCreateDrumPadChain } from "#src/tools/shared/device/helpers/device-chain-creation-helpers.ts";
import { navigateRemainingSegments } from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";

const SAMPLE_PARAM = "sample";

interface DrumPadSlot {
  padNote: string;
  chainIndex: number;
  deviceIndex: number;
}

/**
 * Resolve a path-prefixed pseudo-param (e.g. `pC1/d0/sample`) to the device the
 * param should be written to, relative to the rack being created/updated. The
 * caller splits the param name into a path `prefix` and the trailing
 * `paramName`; this resolves the prefix.
 *
 * For a `sample` write addressing a drum-pad device slot, the pad-property model
 * applies: the pad (always addressable) gets a Simpler to hold the sample,
 * created or replaced per the policy below. Every other case is plain read-only
 * navigation to an existing device.
 *
 * | Pad device slot state    | Behavior                                      |
 * | ------------------------ | --------------------------------------------- |
 * | empty                    | create a Simpler                              |
 * | Simpler (single-sample)  | reuse it (caller's sample write replaces)     |
 * | Simpler (multi-sample)   | reuse it (caller's sample write warn-skips)   |
 * | DrumSampler              | delete, create a Simpler, + notice (stop-gap) |
 * | any other device         | skip and warn (no overwrite)                  |
 *
 * @param rack - The device being created/updated (the path prefix is relative to it)
 * @param prefix - The path segments before the param name (e.g. "pC1/d0")
 * @param paramName - The trailing param name (e.g. "sample", "gainDb")
 * @param toolName - Calling tool name for warning prefix
 * @returns The target device, or null (after warning) when none can be targeted
 */
export function resolveNestedParamTarget(
  rack: LiveAPI,
  prefix: string,
  paramName: string,
  toolName: string,
): LiveAPI | null {
  const segments = prefix.split("/").filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    console.warn(
      `${toolName}: param "${prefix}/${paramName}" has no path before the param name`,
    );

    return null;
  }

  const slot =
    paramName.toLowerCase() === SAMPLE_PARAM
      ? parseDrumPadSlot(segments)
      : null;

  // Pad-property model: a `sample` write to a drum-pad device slot.
  if (slot) {
    return resolveDrumPadSampleTarget(rack, slot, toolName);
  }

  // General case: read-only navigation to an existing device.
  const { target, targetType } = navigateRemainingSegments(rack, segments);

  if (!target?.exists()) {
    console.warn(
      `${toolName}: no device at "${prefix}" relative to the target device`,
    );

    return null;
  }

  if (targetType !== "device") {
    console.warn(
      `${toolName}: "${prefix}" resolves to a ${targetType}, not a device`,
    );

    return null;
  }

  return target;
}

/**
 * Parse a relative path prefix as a drum-pad device slot
 * (`p<note>[/c<chain>][/d<device>]`). The chain and device indices default to 0,
 * so `pC1`, `pC1/d0`, and `pC1/c0/d0` all address the same slot. Returns null
 * for non-drum-pad prefixes, malformed indices, or deeper nesting (handled by
 * the general resolver instead).
 * @param segments - Non-empty path segments
 * @returns The parsed slot, or null
 */
function parseDrumPadSlot(segments: string[]): DrumPadSlot | null {
  const first = assertDefined(segments[0], "pad segment");

  if (!first.startsWith("p")) {
    return null;
  }

  const padNote = first.slice(1);

  if (padNote.length === 0) {
    return null;
  }

  let index = 1;
  let chainIndex = 0;
  const chainSegment = segments[index];

  if (chainSegment?.startsWith("c")) {
    const parsed = Number.parseInt(chainSegment.slice(1));

    if (Number.isNaN(parsed) || parsed < 0) {
      return null;
    }

    chainIndex = parsed;
    index++;
  }

  let deviceIndex = 0;
  const deviceSegment = segments[index];

  if (deviceSegment?.startsWith("d")) {
    const parsed = Number.parseInt(deviceSegment.slice(1));

    if (Number.isNaN(parsed) || parsed < 0) {
      return null;
    }

    deviceIndex = parsed;
    index++;
  }

  // Deeper nesting (e.g. a nested drum rack) is not part of the pad-property
  // shortcut — defer to the general resolver.
  if (index < segments.length) {
    return null;
  }

  return { padNote, chainIndex, deviceIndex };
}

/**
 * Resolve (and, per policy, create/replace) the Simpler that holds a drum pad's
 * sample. The pad's chain auto-creates when missing.
 * @param rack - Drum Rack device
 * @param slot - Parsed drum-pad device slot
 * @param toolName - Calling tool name for warning prefix
 * @returns The Simpler to write the sample to, or null (after warning)
 */
function resolveDrumPadSampleTarget(
  rack: LiveAPI,
  slot: DrumPadSlot,
  toolName: string,
): LiveAPI | null {
  const { padNote, chainIndex, deviceIndex } = slot;
  const chainSegments = chainIndex > 0 ? [`c${chainIndex}`] : [];
  const chain = resolveOrCreateDrumPadChain(rack, padNote, chainSegments);

  if (!chain?.exists()) {
    console.warn(
      `${toolName}: could not resolve or create drum pad "${padNote}"`,
    );

    return null;
  }

  const existing = chain.getChildren("devices")[deviceIndex];

  if (!existing?.exists()) {
    return createSimplerInChain(chain, toolName);
  }

  const className = existing.getProperty("class_display_name") as string;

  if (className === DEVICE_CLASS.SIMPLER) {
    // The recursive sample write replaces a single-sample Simpler and
    // warn-skips a multi-sample one.
    return existing;
  }

  if (isDrumSampler(className)) {
    // Stop-gap: DrumSampler's sample is not controllable via the current Live
    // API, so swap in a Simpler. Revisit when the API exposes its sample.
    // The replacement Simpler is appended at the chain end (createSimplerInChain
    // uses insert_device, which has no position arg). That's correct here: a drum
    // pad chain holds a single instrument, so deleting the DrumSampler and
    // appending the Simpler lands it in the same (first) slot. If a pad ever held
    // an instrument plus trailing effects, the Simpler would land after them —
    // acceptable for this stop-gap since the sample write targets the returned
    // device directly, not a fixed index.
    chain.call("delete_device", deviceIndex);
    console.warn(
      `${toolName}: replaced DrumSampler on pad ${padNote} with a Simpler to load the sample (DrumSampler's sample is not controllable via the Live API)`,
    );

    return createSimplerInChain(chain, toolName);
  }

  console.warn(
    `${toolName}: pad ${padNote} already has a ${className}; not overwriting — delete the pad's device with ppal-delete before setting a sample`,
  );

  return null;
}

/**
 * Insert a Simpler at the end of a (drum pad) chain.
 * @param chain - Chain LiveAPI object
 * @param toolName - Calling tool name for warning prefix
 * @returns The created Simpler, or null (after warning) on failure
 */
function createSimplerInChain(
  chain: LiveAPI,
  toolName: string,
): LiveAPI | null {
  const result = chain.call("insert_device", DEVICE_CLASS.SIMPLER) as
    | [string, string | number]
    | undefined;
  const rawId = result?.[1];
  const id = rawId ? String(rawId) : null;

  if (!id) {
    console.warn(`${toolName}: failed to create a Simpler on the drum pad`);

    return null;
  }

  const device = LiveAPI.from(`id ${id}`);

  return device.exists() ? device : null;
}

/**
 * Test whether a class_display_name is DrumSampler, matched case- and
 * space-insensitively (the exact display string is confirmed against Live).
 * @param className - The device's class_display_name
 * @returns True when the device is a DrumSampler
 */
function isDrumSampler(className: string): boolean {
  const normalize = (value: string): string =>
    value.replaceAll(/\s+/g, "").toLowerCase();

  return normalize(className) === normalize(DEVICE_CLASS.DRUM_SAMPLER);
}
