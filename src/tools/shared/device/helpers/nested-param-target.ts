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
import {
  navigateRemainingSegments,
  resolveDrumPadGroup,
} from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { invalidateDevicePathCache } from "#src/tools/shared/device/helpers/path/with-device-path-cache.ts";
import { isSingleSampleSimpler } from "#src/tools/shared/device/simpler-sample.ts";
import { pathPrefix } from "#src/tools/shared/validation/object-path-for-api.ts";

const SAMPLE_PARAM = "sample";

interface DrumPadSlot {
  padNote: string;
  chainIndex: number;
  /** Whether the caller wrote a `cN` segment, rather than defaulting to 0. */
  chainNamed: boolean;
  /** The `dN` index the caller wrote, when they wrote one. */
  deviceIndex?: number;
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
 * The pad is addressed as `pC1` (one layer) or `pC1/cN` (several); a `dN` is
 * accepted but must name the instrument the search found. Both a stacked pad
 * with no layer named and a `dN` that isn't the instrument skip and warn.
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
 * @param force - Allow the instrument-to-Simpler swap the sample write needs
 * @returns The target device, or null (after warning) when none can be targeted
 */
export function resolveNestedParamTarget(
  rack: LiveAPI,
  prefix: string,
  paramName: string,
  force = false,
): LiveAPI | null {
  const segments = prefix.split("/").filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    console.warn(
      `param "${prefix}/${paramName}" has no path before the param name`,
    );

    return null;
  }

  const slot =
    paramName.toLowerCase() === SAMPLE_PARAM
      ? parseDrumPadSlot(segments)
      : null;

  // Pad-property model: a `sample` write to a drum pad.
  if (slot) {
    return resolveDrumPadSampleTarget(rack, slot, force);
  }

  // General case: read-only navigation to an existing device.
  const { target, targetType } = navigateRemainingSegments(rack, segments);

  if (!target?.exists()) {
    console.warn(`no device at "${pathPrefix(rack)}/${prefix}"`);

    return null;
  }

  if (targetType !== "device") {
    console.warn(
      `"${pathPrefix(rack)}/${prefix}" resolves to a ${targetType}, not a device`,
    );

    return null;
  }

  return target;
}

/**
 * Parse a relative path prefix as a drum pad (`p<note>[/c<chain>][/d<device>]`).
 * The chain index defaults to 0, which the caller only accepts on a pad holding
 * one layer. Returns null for non-drum-pad prefixes, malformed indices, or
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
  let chainNamed = false;
  const chainSegment = segments[index];

  if (chainSegment?.startsWith("c")) {
    const parsed = Number.parseInt(chainSegment.slice(1));

    if (Number.isNaN(parsed) || parsed < 0) {
      return null;
    }

    chainIndex = parsed;
    chainNamed = true;
    index++;
  }

  // A `d<N>` segment is accepted so read and write paths stay interchangeable.
  // It never locates the instrument — that is found by device type — but it is
  // checked against the one found, so a wrong index can't silently "work".
  let deviceIndex: number | undefined;
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

  return { padNote, chainIndex, chainNamed, deviceIndex };
}

/**
 * Resolve (and, per policy, create/replace) the Simpler that holds a drum pad's
 * sample. The pad's chain auto-creates when missing.
 * @param rack - Drum Rack device
 * @param slot - Parsed drum pad slot
 * @param force - Allow the instrument-to-Simpler swap
 * @returns The Simpler to write the sample to, or null (after warning)
 */
function resolveDrumPadSampleTarget(
  rack: LiveAPI,
  slot: DrumPadSlot,
  force: boolean,
): LiveAPI | null {
  const { padNote, chainIndex, chainNamed, deviceIndex } = slot;
  const padLabel = `${pathPrefix(rack)}/p${padNote}`;

  if (!chainNamed && warnAmbiguousLayer(rack, padNote, padLabel)) {
    return null;
  }

  const chainSegments = chainIndex > 0 ? [`c${chainIndex}`] : [];
  const chain = resolveOrCreateDrumPadChain(rack, padNote, chainSegments);

  if (!chain?.exists()) {
    console.warn(`could not resolve or create drum pad "${padLabel}"`);

    return null;
  }

  const instrument = findChainInstrument(chain);

  // Nothing to hold the sample yet, so a `dN` names nothing to disagree with.
  if (!instrument) {
    return createSimplerInChain(chain);
  }

  if (deviceIndex != null && deviceIndex !== instrument.index) {
    const retry = chainNamed
      ? `p${padNote}/c${chainIndex}/sample`
      : `p${padNote}/sample`;

    console.warn(
      `sample write SKIPPED on pad ${padLabel} — d${deviceIndex} ` +
        `is not its instrument, which is at d${instrument.index}. Drop the ` +
        `device segment to find the instrument wherever it sits: "${retry}".`,
    );

    return null;
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
      `sample write SKIPPED on pad ${padLabel} — it holds ` +
        `${description}, whose sample the Live API can't set. Honoring the ` +
        `write REPLACES it with a Simpler, losing all its settings. Ask the ` +
        `user before passing force:true. To keep it: load the sample on ` +
        `another pad, or copy the instrument to a free pad first ` +
        `(ppal-duplicate type:"device").`,
    );

    return null;
  }

  chain.call("delete_device", instrument.index);
  // A delete renumbers the chain's remaining devices, and the path cache's
  // contract says nothing cached survives that. createSimplerInChain invalidates
  // again after its insert; this one keeps the invariant true in between.
  invalidateDevicePathCache();
  console.warn(
    `force:true — replaced ${description} on pad ${padLabel} with a Simpler to load the sample. Its settings are gone.`,
  );

  return createSimplerInChain(chain);
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
 * Warn when a pad holds several layers and the caller named none of them. A
 * sample belongs to one layer, so writing "the pad" used to load the first one
 * silently — and with `force` that replaces an instrument nobody named. Matches
 * the pad-property path, which skips its per-layer settings the same way.
 * @param rack - Drum Rack device
 * @param padNote - The pad's note, as the caller spelled it
 * @param padLabel - The pad's full path, for naming it in the warning
 * @returns Whether the write was skipped
 */
function warnAmbiguousLayer(
  rack: LiveAPI,
  padNote: string,
  padLabel: string,
): boolean {
  const layers = resolveDrumPadGroup(rack.path, padNote)?.chains.length ?? 0;

  if (layers < 2) return false;

  // Name the retries as param names, relative to the rack, since that is what
  // the caller re-sends — not the pad's full path.
  const retries = Array.from(
    { length: layers },
    (_, index) => `"p${padNote}/c${index}/sample"`,
  ).join(", ");

  console.warn(
    `sample write SKIPPED on pad ${padLabel} — it has ${layers} ` +
      `layers, so which one to load is ambiguous. Name one: ${retries}.`,
  );

  return true;
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
 * @returns The created Simpler, or null (after warning) on failure
 */
function createSimplerInChain(chain: LiveAPI): LiveAPI | null {
  const result = chain.call("insert_device", DEVICE_CLASS.SIMPLER) as
    | [string, string | number]
    | undefined;

  // The re-sort pushes the chain's audio effects down a slot, so createDevice's
  // path cache can no longer be trusted for anything below this chain.
  invalidateDevicePathCache();
  const rawId = result?.[1];
  const id = rawId ? String(rawId) : null;

  if (!id) {
    console.warn(`failed to create a Simpler on the drum pad`);

    return null;
  }

  const device = LiveAPI.from(`id ${id}`);

  return device.exists() ? device : null;
}
