// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What a `sample` entry in `params` means when the call didn't address the rack
// and spell the pad in the param name. Both spellings below reach the same pad
// as that shortcut does, and say the same things about it.

import {
  type ParamEntry,
  paramEntryKey,
} from "#src/tools/device/update/device-params-schema.ts";
import {
  type ParamOutcome,
  type ParamResult,
  refreshParamValues,
  skippedParam,
  skippedParamById,
} from "#src/tools/shared/device/helpers/param-reading.ts";
import {
  resolveDrumChainSampleTarget,
  sayWhatWasLeft,
} from "#src/tools/shared/device/helpers/nested-param-target.ts";
import { isSampleParam } from "#src/tools/shared/device/pad-sample-messages.ts";
import { setParamValues } from "../update-device-param-setters.ts";
import { supersededParamReasons } from "./params/superseded-params.ts";
import { type UpdatePropertyOptions } from "./update-device-properties.ts";
import { type TargetNotes } from "#src/tools/shared/helpers/target-notes.ts";
import { notApplicableReason } from "./update-target-types.ts";

/**
 * Apply a `params` write aimed at a drum pad rather than at its rack.
 *
 * The pad is the natural address for its own sample, and the rack's
 * `pC1/sample` param name is documented as a shortcut TO the pad — so both
 * spellings get the same policy: create a Simpler on an empty pad, reuse a
 * single-sample one, and replace anything else only under `force`. Every other
 * param on a chain is still not applicable: a chain has no parameters, and the
 * device that does is addressable by its own path.
 * @param target - The chain or pad the call addressed
 * @param type - Its Live API type
 * @param options - Update options
 * @param notes - What the target's entry has to say, added to
 * @param chainsMade - How many chains this call made on the pad for its sample
 * @returns One entry per param the call sent, in order
 */
export function applyChainSampleParams(
  target: LiveAPI,
  type: string,
  options: UpdatePropertyOptions,
  notes: TargetNotes,
  chainsMade = 0,
): ParamResult[] {
  const params = options.params ?? [];
  const force = options.force ?? false;
  const writable = params.filter(
    (entry) => type === "DrumChain" && isSampleParam(paramEntryKey(entry).key),
  );
  // Each entry is written on its own below, so a later `sample` entry has to
  // be spotted here, or both would load. Only entries that would be written
  // compete: the rest are not applicable either way.
  const superseded = supersededParamReasons(null, writable);

  return refreshParamValues(
    params.flatMap((entry) => {
      const { key, byId } = paramEntryKey(entry);
      const writableIndex = writable.indexOf(entry);
      const skip =
        writableIndex === -1
          ? notApplicableReason("params", type, target)
          : superseded.get(writableIndex);

      if (skip == null) {
        return writeChainSample(target, entry, force, notes, chainsMade);
      }

      return [byId ? skippedParamById(key, skip) : skippedParam(key, skip)];
    }),
  );
}

/**
 * Write one `sample` entry to the instrument the chain holds.
 * @param chain - The DrumChain the call addressed
 * @param entry - The `sample` param entry, as the caller wrote it
 * @param force - Allow the instrument-to-Simpler swap the write needs
 * @param notes - What the chain's entry has to say, added to
 * @param chainsMade - How many chains this call made on the pad for the write
 * @returns What the write landed on, or why it landed nowhere
 */
function writeChainSample(
  chain: LiveAPI,
  entry: ParamEntry,
  force: boolean,
  notes: TargetNotes,
  chainsMade: number,
): ParamOutcome[] {
  const resolved = resolveDrumChainSampleTarget(
    chain,
    force,
    notes,
    chainsMade,
  );

  if ("reason" in resolved) {
    return [skippedParam(paramEntryKey(entry).key, resolved.reason)];
  }

  return sayWhatWasLeft(
    resolved,
    setParamValues(resolved.device, [entry], force, notes),
  );
}
