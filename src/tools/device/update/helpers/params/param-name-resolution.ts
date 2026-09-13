// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { strForValue } from "#src/tools/shared/device/helpers/param-label-parsing.ts";
import { extractDevicePath } from "#src/tools/shared/device/helpers/path/device-path-builders.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/** The tail a Live path adds to a device's own path to name one of its params. */
const PARAMETER_TAIL = / parameters \d+$/;

/**
 * Every parameter on a device matching a name (case-insensitive). A name is not
 * unique within a device — Corpus has two called `Width`, a filter bandwidth and
 * a stereo width — so the caller decides what more than one match means.
 * @param device - LiveAPI device object
 * @param name - Parameter name to find
 * @returns The matching params, in device order
 */
export function resolveParamsByName(device: LiveAPI, name: string): LiveAPI[] {
  return matchParamsByName(device.getChildren("parameters"), name);
}

/**
 * The same match against parameters already read. A caller checking a whole
 * params list reads the device's parameters once and matches every entry
 * against them, instead of re-reading them per entry.
 * @param parameters - The device's parameters
 * @param name - Parameter name to find
 * @returns The matching params, in device order
 */
export function matchParamsByName(
  parameters: LiveAPI[],
  name: string,
): LiveAPI[] {
  const nameLower = name.toLowerCase();

  return parameters.filter((param) => {
    const paramName = param.getName();

    if (paramName.toLowerCase() === nameLower) {
      return true;
    }

    // Also match formatted name "name (original_name)" for rack macros
    const rawOriginalName = param.getProperty("original_name") as
      | string
      | number
      | undefined;
    const originalName = String(rawOriginalName ?? "");

    return (
      originalName !== paramName &&
      `${paramName} (${originalName})`.toLowerCase() === nameLower
    );
  });
}

/**
 * Why a name that names more than one param is written nowhere. Writing the
 * first match lands a value on a control the caller may not have meant and
 * reports success, so the ids are the only way to say which one — they come
 * straight back from read-device.
 * @param matches - The params the name resolved to
 * @param device - The device the name was looked up on
 * @returns The reason, or null when the name reached at most one param
 */
export function ambiguousNameReason(
  matches: LiveAPI[],
  device: LiveAPI,
): string | null {
  if (matches.length < 2) {
    return null;
  }

  const described = matches
    .map(
      (param) =>
        `id ${param.id} (${strForValue(param, param.getProperty("min") as number)} to ${strForValue(param, param.getProperty("max") as number)})`,
    )
    .join(", ");

  return `names ${matches.length} params on ${targetLabel(device)} — ${described} — so nothing was written. Write by id to pick one.`;
}

/** A param key that reached a parameter, or the reason it reached none. */
type ParamLookup = { param: LiveAPI } | { reason: string };

/**
 * Resolve a purely numeric param key as an absolute Live API object id, saying
 * why when it reaches nothing this device owns.
 *
 * Every object id resolves, so the type is checked: a non-parameter reads as a
 * plain enabled parameter with no range (Live answers nothing rather than
 * failing), and the tool would report a write it never made against a name read
 * off some unrelated object.
 *
 * Ownership is checked as well. A param id is global, so an id belonging to
 * another device writes that device while the result — a param entry carries no
 * path of its own, only the device's — reports it under the device the call
 * addressed. Naming where the param actually lives turns that into a one-step
 * correction; the path-prefixed form (`c0/d0/Volume`) is how one call reaches a
 * nested device's param on purpose.
 * @param key - The trimmed param name
 * @param device - The device the call addressed
 * @returns The parameter, or the reason there is none
 */
export function resolveParamById(key: string, device: LiveAPI): ParamLookup {
  const object = /^\d+$/.test(key) ? LiveAPI.from(key) : null;

  if (object?.exists() && object.type === "DeviceParameter") {
    // A param hangs directly off its device, so the device's own canonical path
    // is the whole of its parent path.
    const ownerPath = object.path.replace(PARAMETER_TAIL, "");

    if (ownerPath === device.path) {
      return { param: object };
    }

    return {
      reason: `id ${key} is on ${extractDevicePath(ownerPath) ?? "another object"}, not ${targetLabel(device)}, so it was not written`,
    };
  }

  // Named by the device the key was looked up on, not "this device": a
  // path-prefixed miss (pC1/Cutoff) is looked up on the pad's own device while
  // the entry sits in the rack's result.
  return { reason: `not found on ${targetLabel(device)}` };
}
