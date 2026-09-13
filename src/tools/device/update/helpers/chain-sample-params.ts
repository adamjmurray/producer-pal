// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What a `sample` entry in `params` means when the call didn't address the rack
// and spell the pad in the param name. Both spellings below reach the same pad
// as that shortcut does, and say the same things about it.

import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import {
  type ParamOutcome,
  type ParamResult,
  refreshParamValues,
  skippedParam,
} from "#src/tools/shared/device/helpers/param-reading.ts";
import { resolveDrumChainSampleTarget } from "#src/tools/shared/device/helpers/nested-param-target.ts";
import { isSampleParam } from "#src/tools/shared/device/pad-sample-messages.ts";
import { setParamValues } from "../update-device-param-setters.ts";
import { type UpdatePropertyOptions } from "./update-device-properties.ts";
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
 * @returns One entry per param the call sent, in order
 */
export function applyChainSampleParams(
  target: LiveAPI,
  type: string,
  options: UpdatePropertyOptions,
): ParamResult[] {
  const params = options.params ?? [];
  const force = options.force ?? false;

  return refreshParamValues(
    params.flatMap((entry) =>
      type === "DrumChain" && isSampleParam(entry.name.trim())
        ? writeChainSample(target, entry, force)
        : [
            skippedParam(
              entry.name,
              notApplicableReason("params", type, target),
            ),
          ],
    ),
  );
}

/**
 * Write one `sample` entry to the instrument the chain holds.
 * @param chain - The DrumChain the call addressed
 * @param entry - The `sample` param entry, as the caller wrote it
 * @param force - Allow the instrument-to-Simpler swap the write needs
 * @returns What the write landed on, or why it landed nowhere
 */
function writeChainSample(
  chain: LiveAPI,
  entry: ParamEntry,
  force: boolean,
): ParamOutcome[] {
  const resolved = resolveDrumChainSampleTarget(chain, force);

  if ("reason" in resolved) {
    return [skippedParam(entry.name, resolved.reason)];
  }

  return setParamValues(resolved.device, [entry], force);
}
