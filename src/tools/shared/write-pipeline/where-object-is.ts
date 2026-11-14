// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  pathField,
  type WrittenContainer,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { objectIsGone } from "./object-is-gone.ts";

/**
 * Where an object sits now and what to call it: the `Locate.whereIs` of a tool
 * whose paths are the ones the grammar spells. Looked up fresh from the id.
 * @param id - The object's id
 * @param container - The caller's spelling of the object's parent, to echo
 * @returns Its path and noun, or undefined when it is gone or has no path
 */
export function whereObjectIs(
  id: string,
  container?: WrittenContainer,
): { path: string; noun: string } | undefined {
  const object = LiveAPI.from(id);

  if (objectIsGone(object)) {
    return undefined;
  }

  const { path } = pathField(object, container);

  return path == null ? undefined : { path, noun: nounFor(object.type) };
}

// --- Helpers below main export ---

/**
 * What to call an object of a Live type in a sentence.
 * @param type - The object's Live type
 * @returns The noun; "device" for any of the many device types
 */
function nounFor(type: string): string {
  if (type === "Chain" || type === "DrumChain") {
    return "chain";
  }

  if (type === "DrumPad") {
    return "pad";
  }

  if (type === "TakeLane") {
    return "take lane";
  }

  if (type === "Scene" || type === "Clip") {
    return type.toLowerCase();
  }

  return type.endsWith("Track") ? "track" : "device";
}
