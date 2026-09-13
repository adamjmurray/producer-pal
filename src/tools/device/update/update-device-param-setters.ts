// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import {
  type ParamOutcome,
  skippedParam,
} from "#src/tools/shared/device/helpers/param-reading.ts";
import {
  isDrumPadSampleShortcut,
  resolveNestedParamTarget,
  splitForAdvice,
} from "#src/tools/shared/device/helpers/nested-param-target.ts";
import {
  isSampleParam,
  unsettableSampleReason,
} from "#src/tools/shared/device/pad-sample-messages.ts";
import { applySpecializedParamWrite } from "#src/tools/shared/device/specialized/specialized-device-registry.ts";
import { pathPrefix } from "#src/tools/shared/validation/object-path-for-api.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { refuseDuplicateParams } from "./helpers/params/param-entry-validation.ts";
import {
  ambiguousNameReason,
  resolveParamById,
  resolveParamsByName,
} from "./helpers/params/param-name-resolution.ts";
import { setParamValue } from "./helpers/params/param-value-interpretation.ts";
import { type ParamWriteOutcome } from "./helpers/params/param-write-verification.ts";
import { normalizeParamValue } from "./update-device-param-parser.ts";

/**
 * Set parameter values from an array of {name, value} entries. Specialized-device
 * pseudo-params (e.g. `sample` for Simpler, `routingMode` for Roar) are
 * dispatched via the specialized-device registry before falling through to
 * DeviceParameter resolution.
 *
 * Every entry comes back as one result entry, in the order sent: what the write
 * landed on, or the reason nothing was written. Nothing here warns — the param's
 * own entry is where the caller reads what happened to it.
 * @param device - LiveAPI device object to update
 * @param params - Array of {name, value} param entries
 * @param force - Allow a destructive pad-device swap a `sample` write needs
 * @returns One entry per param named, in order
 */
export function setParamValues(
  device: LiveAPI,
  params: ParamEntry[],
  force = false,
): ParamOutcome[] {
  // Before the first write: two entries reaching one param can only report the
  // last one's value for both, and the caller can retry with nothing to undo.
  refuseDuplicateParams(device, params);

  const results: ParamOutcome[] = [];
  // Read once per device, not per param: it only names the device for the
  // recorded-unit lookup.
  const deviceName = device.getProperty("class_display_name") as
    | string
    | undefined;

  for (const entry of params) {
    // Malformed entries were refused up front, so both sides are non-empty.
    const key = entry.name.trim();
    const rawValue = entry.value.trim();

    // Isolate each param: a throw resolving one (e.g. a path-prefixed pad param
    // whose chain auto-create exceeds the cap) must not abort the rest of a
    // multi-param update. It becomes that param's own skip entry, the way a
    // target that throws becomes the target's.
    try {
      results.push(...setOneParam(device, key, rawValue, force, deviceName));
    } catch (e) {
      results.push(skippedParam(key, errorMessage(e)));
    }
  }

  return results;
}

/**
 * Resolve and set a single param entry (path-prefixed pseudo-param, specialized
 * pseudo-param, or DeviceParameter by name/index). Separated from the loop so
 * each entry can be try-isolated. Key and value are already trimmed and non-empty.
 * @param device - LiveAPI device object to update
 * @param key - Trimmed param name (may be a "/"-path or a slash-named param)
 * @param rawValue - Trimmed value
 * @param force - Allow a destructive pad-device swap a `sample` write needs
 * @param deviceName - The device's class_display_name
 * @returns The entry for this param
 */
function setOneParam(
  device: LiveAPI,
  key: string,
  rawValue: string,
  force: boolean,
  deviceName: string | undefined,
): ParamOutcome[] {
  // A name containing "/" is normally a path-prefixed pseudo-param
  // (e.g. "pC1/sample"): resolve the prefix relative to this device, then
  // write the trailing param to the target. But some real DeviceParameters
  // have a "/" in their name (e.g. "Dry/Wet" on Reverb/Delay/Glue Compressor),
  // so prefer an exact param-name match first and only fall back to
  // path-routing when no such param exists — keeping slash-named params
  // settable by name.
  if (key.includes("/")) {
    const matches = resolveParamsByName(device, key);
    const ambiguous = ambiguousNameReason(matches, device);

    if (ambiguous != null) {
      return [skippedParam(key, ambiguous)];
    }

    const namedParam = matches[0];

    if (namedParam?.exists()) {
      return [
        paramEntry(
          key,
          setParamValue(
            namedParam,
            normalizeParamValue(rawValue, deviceName, key),
            rawValue,
            deviceName,
          ),
        ),
      ];
    }

    return applyNestedParam(device, key, rawValue, force);
  }

  const inputValue = normalizeParamValue(rawValue, deviceName, key);

  // A specialized pseudo-param (e.g. Simpler's `sample`) is a device property
  // rather than a DeviceParameter, so it reports a name and a value but no id.
  // Empty means a pseudo-param whose own `write` refused the value: the one
  // param a call names that still answers with a warning and no entry, because
  // that write contract is a boolean across every device spec.
  const pseudoParam = applySpecializedParamWrite(device, key, inputValue);

  if (pseudoParam != null) {
    return pseudoParam;
  }

  const matches = resolveParamsByName(device, key);
  const ambiguous = ambiguousNameReason(matches, device);

  if (ambiguous != null) {
    return [skippedParam(key, ambiguous)];
  }

  const named = matches[0];

  if (named?.exists()) {
    return [
      paramEntry(key, setParamValue(named, inputValue, rawValue, deviceName)),
    ];
  }

  // A `sample` write that matched no pseudo-param and no parameter reached a
  // device with no sample to set. "Not found" would read as a misspelling and
  // send the model hunting for the right name; the reason below says what is
  // true, and on a drum pad names the (destructive) call that can honor it.
  if (isSampleParam(key)) {
    return [skippedParam(key, unsettableSampleReason(device))];
  }

  const lookup = resolveParamById(key, device);

  if ("reason" in lookup) {
    return [skippedParam(key, lookup.reason)];
  }

  return [
    paramEntry(
      key,
      setParamValue(lookup.param, inputValue, rawValue, deviceName),
    ),
  ];
}

/**
 * One param's entry. A write that landed reports the param's own name and id; a
 * write that landed nowhere is named the way the call spelled it, since that is
 * all the caller has to match it on.
 * @param key - The param name as the caller wrote it
 * @param outcome - What the write did
 * @returns The entry for this param
 */
function paramEntry(key: string, outcome: ParamWriteOutcome): ParamOutcome {
  return "id" in outcome ? outcome : skippedParam(key, outcome.reason);
}

/**
 * Apply a path-prefixed pseudo-param. The prefix (everything before the last
 * "/") resolves to a target device relative to `device`; the trailing segment is
 * the param name, written via a single-entry recursion through setParamValues so
 * all value interpretation (enum, note, numeric, specialized pseudo-params) is
 * reused.
 *
 * Every form but the drum-pad `sample` shortcut is deprecated: the nested
 * device it names is reachable by its own `path` instead. That warning fires
 * before resolution is attempted, so it still reaches a prefix that resolves
 * to nothing.
 * @param device - The device the path prefix is relative to (e.g. a Drum Rack)
 * @param key - Full path-prefixed param name (e.g. "pC1/sample")
 * @param rawValue - Trimmed value to write
 * @param force - Allow a destructive pad-device swap a `sample` write needs
 * @returns The entry for this param
 */
function applyNestedParam(
  device: LiveAPI,
  key: string,
  rawValue: string,
  force: boolean,
): ParamOutcome[] {
  const slashIndex = key.lastIndexOf("/");
  const prefix = key.slice(0, slashIndex);
  // Refused up front, so there is a name after the last "/".
  const paramName = key.slice(slashIndex + 1).trim();

  if (!isDrumPadSampleShortcut(prefix, paramName)) {
    // Advice is split from the LEFT (see splitForAdvice), independent of the
    // resolution split above: a slash-named param like Dry/Wet needs the
    // whole "Dry/Wet" as its name, not just "Wet", or the path this names
    // wouldn't resolve either.
    const advice = splitForAdvice(key);

    console.warn(
      `params name "${key}" is deprecated and will be removed; use path "${pathPrefix(device)}/${advice.path}" with name "${advice.name}"`,
    );
  }

  const target = resolveNestedParamTarget(device, prefix, paramName, force);

  // Named as the caller wrote it: a list that came back a name short is one
  // the caller has to diff against its own request to read.
  if ("reason" in target) {
    return [skippedParam(key, target.reason)];
  }

  // Report the param under the path the caller addressed it by: sixteen pads'
  // worth of bare "Volume" entries would name nothing. A skip is named with the
  // key exactly as it arrived, spacing and all, since that is what the caller
  // has to match it on.
  return setParamValues(
    target.device,
    [{ name: paramName, value: rawValue }],
    force,
  ).map((result) =>
    "ok" in result
      ? { ...result, name: key }
      : { ...result, name: `${prefix}/${result.name}` },
  );
}
