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
  ambiguousLayerReason,
  isSampleParam,
  padSampleSwapReason,
  unsettableSampleHolder,
} from "#src/tools/shared/device/pad-sample-messages.ts";
import {
  navigateRemainingSegments,
  resolveDrumPadGroup,
} from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { invalidateDevicePathCache } from "#src/tools/shared/device/helpers/path/with-device-path-cache.ts";
import { isSingleSampleSimpler } from "#src/tools/shared/device/simpler-sample.ts";
import { pathPrefix } from "#src/tools/shared/validation/object-path-for-api.ts";

interface DrumPadSlot {
  padNote: string;
  chainIndex: number;
  /** Whether the caller wrote a `cN` segment, rather than defaulting to 0. */
  chainNamed: boolean;
  /** The `dN` index the caller wrote, when they wrote one. */
  deviceIndex?: number;
}

/**
 * Whether a path-prefixed param name is the drum-pad `sample` shortcut — the
 * only path-prefixed param form that isn't deprecated. Every other prefixed
 * name is redundant with addressing the nested device by its own `path`; the
 * pad shortcut isn't, because the Simpler a sample write needs may not exist
 * yet to have a path.
 * @param prefix - The path segments before the param name, as the caller wrote them
 * @param paramName - The trailing param name
 * @returns Whether the prefix names a drum pad slot for a `sample` write
 */
export function isDrumPadSampleShortcut(
  prefix: string,
  paramName: string,
): boolean {
  if (!isSampleParam(paramName)) {
    return false;
  }

  const segments = prefix.split("/").filter((segment) => segment.length > 0);

  return segments.length > 0 && parseDrumPadSlot(segments) != null;
}

/** The shape of a leading path segment: `c<n>`, `rc<n>`, `d<n>`, or `p<note>`/`p*`. */
const PATH_SEGMENT = /^(?:c\d+|rc\d+|d\d+|p.+)$/;

/**
 * Splits a path-prefixed param name into the path it names and the name after
 * it, walking from the LEFT: as many leading segments as look like path
 * segments, with everything left over — however many more "/" it has — as the
 * name.
 *
 * This deliberately splits differently from resolution, which takes
 * everything after the LAST "/" as the name — right for the `sample`
 * shortcut, but wrong for a slash-named param (e.g. Dry/Wet) reached through a
 * prefix: that split lands on prefix "c0/d0/Dry" + name "Wet", which
 * navigates into nothing. Resolution stays as-is regardless — the form is
 * being retired — but the deprecation warning built from this split names a
 * path that actually resolves, so a model that follows it doesn't make a
 * second failing call.
 * @param key - Full path-prefixed param name, as the caller wrote it
 * @returns The leading path and the name after it
 */
export function splitForAdvice(key: string): { path: string; name: string } {
  const segments = key.split("/");
  let index = 0;

  while (
    index < segments.length - 1 &&
    PATH_SEGMENT.test(segments[index] ?? "")
  ) {
    index++;
  }

  return {
    path: segments.slice(0, index).join("/"),
    name: segments.slice(index).join("/"),
  };
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
 * @returns The target device, or the reason nothing can be targeted
 */
export function resolveNestedParamTarget(
  rack: LiveAPI,
  prefix: string,
  paramName: string,
  force = false,
): NestedParamTarget {
  const segments = prefix.split("/").filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return skip(
      `param "${prefix}/${paramName}" has no path before the param name`,
    );
  }

  const slot = isSampleParam(paramName) ? parseDrumPadSlot(segments) : null;

  // Pad-property model: a `sample` write to a drum pad.
  if (slot) {
    return resolveDrumPadSampleTarget(rack, slot, force);
  }

  // General case: read-only navigation to an existing device.
  const { target, targetType } = navigateRemainingSegments(rack, segments);

  if (!target?.exists()) {
    return skip(`no device at "${pathPrefix(rack)}/${prefix}"`);
  }

  if (targetType !== "device") {
    return skip(
      `"${pathPrefix(rack)}/${prefix}" resolves to a ${targetType}, not a device`,
    );
  }

  return { device: target };
}

/**
 * Resolve (and, per policy, create/replace) the Simpler that holds one drum
 * chain's sample, for a `sample` write addressed to the pad itself rather than
 * to its rack. Same policy as the rack's `pC1/sample` shortcut — the pad is the
 * address, whichever way the caller spells it.
 *
 * Layer ambiguity is the caller's to settle: a chain names one layer already,
 * and a bare pad path is refused before it gets here.
 * @param chain - The DrumChain the write addressed
 * @param force - Allow the instrument-to-Simpler swap the sample write needs
 * @returns The Simpler to write the sample to, or the reason there is none
 */
export function resolveDrumChainSampleTarget(
  chain: LiveAPI,
  force: boolean,
): NestedParamTarget {
  const instrument = findChainInstrument(chain);

  return instrument == null
    ? createSimplerInChain(chain)
    : applyPadInstrumentPolicy(chain, instrument, pathPrefix(chain), force);
}

/** The device a nested param write lands on, or why it lands on nothing. */
export type NestedParamTarget = { device: LiveAPI } | { reason: string };

/**
 * Say why a write landed nowhere, in both channels at once: the reason goes in
 * the param's own result entry, and the warning stays until every way a param
 * write can fail has an entry of its own.
 * @param reason - Why nothing was written
 * @returns The reason, as a resolution result
 */
function skip(reason: string): NestedParamTarget {
  console.warn(reason);

  return { reason };
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
 * @returns The Simpler to write the sample to, or the reason there is none
 */
function resolveDrumPadSampleTarget(
  rack: LiveAPI,
  slot: DrumPadSlot,
  force: boolean,
): NestedParamTarget {
  const { padNote, chainIndex, chainNamed, deviceIndex } = slot;
  const padLabel = `${pathPrefix(rack)}/p${padNote}`;
  const ambiguous = chainNamed
    ? null
    : ambiguousLayerSkip(rack, padNote, padLabel);

  if (ambiguous) {
    return ambiguous;
  }

  const chainSegments = chainIndex > 0 ? [`c${chainIndex}`] : [];
  const chain = resolveOrCreateDrumPadChain(rack, padNote, chainSegments);

  if (!chain?.exists()) {
    return skip(`could not resolve or create drum pad "${padLabel}"`);
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

    return skip(
      `sample write SKIPPED on pad ${padLabel} — d${deviceIndex} ` +
        `is not its instrument, which is at d${instrument.index}. Drop the ` +
        `device segment to find the instrument wherever it sits: "${retry}".`,
    );
  }

  return applyPadInstrumentPolicy(chain, instrument, padLabel, force);
}

/**
 * Decide what a pad's existing instrument means for a sample write: a
 * single-sample Simpler takes it, and anything else is replaced only under
 * `force`, because the Live API has no other way to honor the write.
 * @param chain - The pad's chain
 * @param instrument - The instrument the chain holds, and its index in it
 * @param padLabel - How to name the pad
 * @param force - Allow the instrument-to-Simpler swap
 * @returns The Simpler to write the sample to, or the reason there is none
 */
function applyPadInstrumentPolicy(
  chain: LiveAPI,
  instrument: { device: LiveAPI; index: number },
  padLabel: string,
  force: boolean,
): NestedParamTarget {
  const className = instrument.device.getProperty(
    "class_display_name",
  ) as string;

  // A single-sample Simpler is already the pad's sample holder, loaded or not —
  // the caller's write lands on it as-is.
  if (isSingleSampleSimpler(instrument.device, className)) {
    return { device: instrument.device };
  }

  // Nothing else has a settable sample, so the only way to honor the write is
  // to swap in a fresh Simpler, which loses every setting on the instrument it
  // replaces. Too destructive to do silently — skip, and let `force` through
  // once the user has agreed.
  const held = unsettableSampleHolder(className);

  if (!force) {
    return skip(padSampleSwapReason(padLabel, held));
  }

  chain.call("delete_device", instrument.index);
  // A delete renumbers the chain's remaining devices, and the path cache's
  // contract says nothing cached survives that. createSimplerInChain invalidates
  // again after its insert; this one keeps the invariant true in between.
  invalidateDevicePathCache();
  console.warn(
    `force:true — replaced ${held} on pad ${padLabel} with a Simpler to load the sample. Its settings are gone.`,
  );

  return createSimplerInChain(chain);
}

/**
 * Skip when a pad holds several layers and the caller named none of them. A
 * sample belongs to one layer, so writing "the pad" used to load the first one
 * silently — and with `force` that replaces an instrument nobody named. Matches
 * the pad-property path, which skips its per-layer settings the same way.
 * @param rack - Drum Rack device
 * @param padNote - The pad's note, as the caller spelled it
 * @param padLabel - The pad's full path, for naming it in the warning
 * @returns The skip, or null when the pad holds at most one layer
 */
function ambiguousLayerSkip(
  rack: LiveAPI,
  padNote: string,
  padLabel: string,
): NestedParamTarget | null {
  const layers = resolveDrumPadGroup(rack.path, padNote)?.chains.length ?? 0;

  if (layers < 2) {
    return null;
  }

  // Name the retries as param names, relative to the rack, since that is what
  // the caller re-sends — not the pad's full path.
  const retries = Array.from(
    { length: layers },
    (_, index) => `p${padNote}/c${index}/sample`,
  );

  return skip(ambiguousLayerReason(padLabel, retries));
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
 * @returns The created Simpler, or the reason there is none
 */
function createSimplerInChain(chain: LiveAPI): NestedParamTarget {
  const result = chain.call("insert_device", DEVICE_CLASS.SIMPLER) as
    | [string, string | number]
    | undefined;

  // The re-sort pushes the chain's audio effects down a slot, so createDevice's
  // path cache can no longer be trusted for anything below this chain.
  invalidateDevicePathCache();
  const rawId = result?.[1];
  const id = rawId ? String(rawId) : null;

  if (!id) {
    return skip(`failed to create a Simpler on the drum pad`);
  }

  const device = LiveAPI.from(`id ${id}`);

  return device.exists()
    ? { device }
    : skip(`the Simpler created on the drum pad could not be read back`);
}
