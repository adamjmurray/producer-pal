// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { strForValue } from "#src/tools/shared/device/helpers/device-label-helpers.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/**
 * Every parameter on a device matching a name (case-insensitive). A name is not
 * unique within a device — Corpus has two called `Width`, a filter bandwidth and
 * a stereo width — so the caller decides what more than one match means.
 * @param device - LiveAPI device object
 * @param name - Parameter name to find
 * @returns The matching params, in device order
 */
export function resolveParamsByName(device: LiveAPI, name: string): LiveAPI[] {
  const nameLower = name.toLowerCase();

  return device.getChildren("parameters").filter((param) => {
    const paramName = param.getProperty("name") as string;

    if (paramName.toLowerCase() === nameLower) return true;

    // Also match formatted name "name (original_name)" for rack macros
    const originalName = param.getProperty("original_name") as string;

    return (
      originalName !== paramName &&
      `${paramName} (${originalName})`.toLowerCase() === nameLower
    );
  });
}

/**
 * Warn and skip when a name names more than one param. Writing the first match
 * lands a value on a control the caller may not have meant and reports success,
 * so the ids are the only way to say which one — they come straight back from
 * read-device.
 * @param matches - The params the name resolved to
 * @param name - The name as the caller wrote it
 * @param toolName - Calling tool name for warning prefix
 * @param device - The device the name was looked up on
 * @returns True if the name was ambiguous and nothing should be written
 */
export function warnIfAmbiguousName(
  matches: LiveAPI[],
  name: string,
  toolName: string,
  device: LiveAPI,
): boolean {
  if (matches.length < 2) return false;

  const described = matches
    .map(
      (param) =>
        `id ${param.id} (${strForValue(param, param.getProperty("min") as number)} to ${strForValue(param, param.getProperty("max") as number)})`,
    )
    .join(", ");

  console.warn(
    `${toolName}: param "${name}" names ${matches.length} params on ${targetLabel(device)} — ${described} — so nothing was written. Write by id to pick one.`,
  );

  return true;
}
