// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { assertDefined } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  DEVICE_CLASS,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "#src/tools/constants.ts";
import { resolveOrCreateDrumPadChain } from "#src/tools/shared/device/helpers/device-chain-creation-helpers.ts";
import { navigateRemainingSegments } from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { isSingleSampleSimpler } from "#src/tools/shared/device/simpler-sample.ts";

const SAMPLE_PARAM = "sample";

interface DrumPadSlot {
  padNote: string;
  chainIndex: number;
}

/**
 * Resolve a path-prefixed pseudo-param (e.g. `pC1/sample`) to the device the
 * param should be written to, relative to the rack being created/updated. The
 * caller splits the param name into a path `prefix` and the trailing
 * `paramName`; this resolves the prefix.
 *
 * For a `sample` write addressing a drum pad, the pad-property model applies:
 * the pad (always addressable) gets a Simpler to hold the sample, created or
 * replaced per the policy below. Every other case — including a `sample` write
 * to an explicit non-pad device path — is plain read-only navigation to an
 * existing device.
 *
 * | Pad instrument           | Behavior                                      |
 * | ------------------------ | --------------------------------------------- |
 * | none                     | create a Simpler                              |
 * | Simpler (single-sample)  | reuse it (caller's sample write replaces)     |
 * | Simpler (multi-sample)   | skip and warn; `force` swaps in a Simpler     |
 * | any other instrument     | skip and warn; `force` swaps in a Simpler     |
 *
 * @param rack - The device being created/updated (the path prefix is relative to it)
 * @param prefix - The path segments before the param name (e.g. "pC1")
 * @param paramName - The trailing param name (e.g. "sample", "gainDb")
 * @param toolName - Calling tool name for warning prefix
 * @param force - Allow the instrument-to-Simpler swap the sample write needs
 * @returns The target device, or null (after warning) when none can be targeted
 */
export function resolveNestedParamTarget(
  rack: LiveAPI,
  prefix: string,
  paramName: string,
  toolName: string,
  force = false,
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

  // Pad-property model: a `sample` write to a drum pad.
  if (slot) {
    return resolveDrumPadSampleTarget(rack, slot, toolName, force);
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
 * Parse a relative path prefix as a drum pad (`p<note>[/c<chain>][/d<device>]`).
 * The chain index defaults to 0, so `pC1`, `pC1/d0`, and `pC1/c0/d0` all address
 * the same pad. Returns null for non-drum-pad prefixes, malformed indices, or
 * deeper nesting (handled by the general resolver instead).
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

  // A `d<N>` segment is accepted so read and write paths stay interchangeable,
  // but its value is ignored: the pad's instrument is found by device type, not
  // by index.
  const deviceSegment = segments[index];

  if (deviceSegment?.startsWith("d")) {
    const parsed = Number.parseInt(deviceSegment.slice(1));

    if (Number.isNaN(parsed) || parsed < 0) {
      return null;
    }

    index++;
  }

  // Deeper nesting (e.g. a nested drum rack) is not part of the pad-property
  // shortcut — defer to the general resolver.
  if (index < segments.length) {
    return null;
  }

  return { padNote, chainIndex };
}

/**
 * Resolve (and, per policy, create/replace) the Simpler that holds a drum pad's
 * sample. The pad's chain auto-creates when missing.
 * @param rack - Drum Rack device
 * @param slot - Parsed drum pad slot
 * @param toolName - Calling tool name for warning prefix
 * @param force - Allow the instrument-to-Simpler swap
 * @returns The Simpler to write the sample to, or null (after warning)
 */
function resolveDrumPadSampleTarget(
  rack: LiveAPI,
  slot: DrumPadSlot,
  toolName: string,
  force: boolean,
): LiveAPI | null {
  const { padNote, chainIndex } = slot;
  const chainSegments = chainIndex > 0 ? [`c${chainIndex}`] : [];
  const chain = resolveOrCreateDrumPadChain(rack, padNote, chainSegments);

  if (!chain?.exists()) {
    console.warn(
      `${toolName}: could not resolve or create drum pad "${padNote}"`,
    );

    return null;
  }

  const instrument = findChainInstrument(chain);

  if (!instrument) {
    return createSimplerInChain(chain, toolName);
  }

  const className = instrument.device.getProperty(
    "class_display_name",
  ) as string;

  // A single-sample Simpler is already the pad's sample holder, loaded or not —
  // the caller's write lands on it as-is.
  if (isSingleSampleSimpler(instrument.device, className)) {
    return instrument.device;
  }

  // Nothing else has a settable sample: the Live API exposes `replace_sample`
  // only on a single-sample Simpler, and can't take a Simpler out of
  // multi-sample mode. So the only way to honor the write is to swap in a fresh
  // Simpler, which loses every setting on the instrument it replaces. Too
  // destructive to do silently — warn and skip, and let `force` through once the
  // user has agreed.
  const description =
    className === DEVICE_CLASS.SIMPLER
      ? "a Simpler in multi-sample mode"
      : `${article(className)} ${className}`;

  if (!force) {
    console.warn(
      `${toolName}: sample write SKIPPED on pad ${padNote} — it holds ` +
        `${description}, whose sample the Live API can't set. Honoring the ` +
        `write REPLACES it with a Simpler, losing all its settings. Ask the ` +
        `user before passing force:true. To keep it: load the sample on ` +
        `another pad, or copy the instrument to a free pad first ` +
        `(ppal-duplicate type:"device").`,
    );

    return null;
  }

  chain.call("delete_device", instrument.index);
  console.warn(
    `${toolName}: force:true — replaced ${description} on pad ${padNote} with a Simpler to load the sample. Its settings are gone.`,
  );

  return createSimplerInChain(chain, toolName);
}

/**
 * The indefinite article for a device class name, so the skip warning reads
 * "an Operator" rather than "a Operator".
 * @param name - The name the article precedes
 * @returns "an" before a vowel, "a" otherwise
 */
function article(name: string): string {
  return /^[aeiou]/i.test(name) ? "an" : "a";
}

/**
 * Find the instrument in a drum pad chain. Live keeps a chain sorted by device
 * type — MIDI effects, then the instrument, then audio effects — so the
 * instrument is not reliably at index 0: any pad with an arpeggiator or velocity
 * device in front of it would otherwise resolve to the wrong device.
 * @param chain - Chain LiveAPI object
 * @returns The instrument and its index in the chain, or null when it has none
 */
function findChainInstrument(
  chain: LiveAPI,
): { device: LiveAPI; index: number } | null {
  const devices = chain.getChildren("devices");
  const index = devices.findIndex(
    (device) => device.getProperty("type") === LIVE_API_DEVICE_TYPE_INSTRUMENT,
  );

  return index < 0
    ? null
    : { device: assertDefined(devices[index], "chain instrument"), index };
}

/**
 * Insert a Simpler into a (drum pad) chain. `insert_device` appends, but Live
 * re-sorts a chain by device type, so the Simpler lands after any MIDI effects
 * and before any audio effects on its own.
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
