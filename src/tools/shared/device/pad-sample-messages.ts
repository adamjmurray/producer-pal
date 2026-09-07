// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  DEVICE_CLASS,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "#src/tools/constants.ts";
import {
  pathPrefix,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";

/**
 * The one reason every skip below shares: the Live API exposes `replace_sample`
 * only on a single-sample Simpler, and can't take a Simpler out of multi-sample
 * mode. Said once so the three spellings of a pad sample write can't drift.
 */
const CANNOT_SET = "whose sample the Live API can't set";

/** A device sitting directly in a drum pad's chain, as its own path spells it. */
const PAD_CHAIN_DEVICE = /^(.*)\/(p[^/]+\/c\d+)\/d\d+$/;

/**
 * Whether a param name is the `sample` pseudo-param, however the caller cased it.
 * @param name - The param name, already trimmed
 * @returns Whether it names a sample write
 */
export function isSampleParam(name: string): boolean {
  return name.toLowerCase() === "sample";
}

/**
 * How a skip message names an instrument whose sample can't be written.
 * @param className - The instrument's class_display_name
 * @returns A noun phrase, e.g. "a Drum Sampler"
 */
export function unsettableSampleHolder(className: string): string {
  return className === DEVICE_CLASS.SIMPLER
    ? "a Simpler in multi-sample mode"
    : `${article(className)} ${className}`;
}

/**
 * Why a pad-addressed sample write was skipped: honoring it would replace the
 * instrument the pad already holds.
 * @param padLabel - How to name the pad
 * @param held - What the pad holds, from {@link unsettableSampleHolder}
 * @returns The reason, for both the result entry and the warning
 */
export function padSampleSwapReason(padLabel: string, held: string): string {
  return (
    `sample write SKIPPED on pad ${padLabel} — it holds ${held}, ` +
    `${CANNOT_SET}. Honoring the write REPLACES it with a Simpler, losing ` +
    `all its settings. Ask the user before passing force:true. To keep it: ` +
    `load the sample on another pad, or copy the instrument to a free pad ` +
    `first (ppal-duplicate type:"device").`
  );
}

/**
 * Why a sample write onto a stacked pad was skipped. A sample belongs to one
 * layer, so writing "the pad" would load whichever layer happens to be first —
 * and under `force` replace an instrument nobody named.
 * @param padLabel - How to name the pad
 * @param retries - The per-layer addresses to use instead, in the caller's own
 *   spelling (param names for the rack shortcut, paths for a pad target)
 * @returns The reason, for both the result entry and the warning
 */
export function ambiguousLayerReason(
  padLabel: string,
  retries: string[],
): string {
  const named = retries.map((retry) => `"${retry}"`).join(", ");

  return (
    `sample write SKIPPED on pad ${padLabel} — it has ${retries.length} ` +
    `layers, so which one to load is ambiguous. Name one: ${named}.`
  );
}

/**
 * Why a sample write addressed to a device itself was skipped. The device path
 * is what read-device prints, so this is the spelling a model reaches for — and
 * "param not found" reads as a typo when the truth is that nothing but a
 * single-sample Simpler has a sample to set.
 *
 * A device path never creates or replaces a device, so this only ever explains.
 * On a drum pad the write is possible, through the pad, and that call is named
 * here. Whether it costs anything depends on what the caller addressed: the
 * pad's instrument would be replaced, so the user has to agree first; anything
 * else on the pad is left alone by the same call.
 * @param device - The device the write reached
 * @returns The reason, for both the result entry and the warning
 */
export function unsettableSampleReason(device: LiveAPI): string {
  const className = device.getProperty("class_display_name") as string;
  const head =
    `sample write SKIPPED on ${targetLabel(device)} — it is ` +
    `${unsettableSampleHolder(className)}, ${CANNOT_SET}`;
  const pad = PAD_CHAIN_DEVICE.exec(pathPrefix(device));

  if (pad == null) {
    return `${head}. Only a Simpler in single-sample mode has one to set.`;
  }

  const call = `path:"${pad[1]}" with params:[{name:"${pad[2]}/sample", value:"<the sample>"}]`;

  // The redirect deliberately omits `force:true`. Handing back a ready-to-run
  // destructive call is what this whole guard exists to prevent: the pad call
  // named here hits the swap guard in turn, which is where the escape hatch is
  // offered — after the user has been asked, not before.
  return device.getProperty("type") === LIVE_API_DEVICE_TYPE_INSTRUMENT
    ? `${head}. Loading a sample here REPLACES the device with a Simpler and ` +
        `loses all its settings, so ask the user first. The pad, not the ` +
        `device, is what takes a sample: ${call}.`
    : `${head}. A pad's sample belongs to its instrument, not to this ` +
        `device — address the pad: ${call}.`;
}

/**
 * The indefinite article for a device class name, so a skip reads "an Operator"
 * rather than "a Operator".
 * @param name - The name the article precedes
 * @returns "an" before a vowel, "a" otherwise
 */
function article(name: string): string {
  return /^[aeiou]/i.test(name) ? "an" : "a";
}
