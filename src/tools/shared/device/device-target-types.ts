// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { isDeviceClass } from "#src/tools/shared/device/is-device-class.ts";
import { publishedType } from "#src/tools/shared/validation/id-validation.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type LiveObjectType } from "#src/types/live-object-types.ts";

/** Where this tool's prose says more than the shared vocabulary does. */
const PROSE_WORDS: Record<string, string> = {
  DrumChain: "drum pad chain",
  DrumPad: "drum pad",
};

/**
 * Check if type is a device, chain, or drum pad
 * @param type - Live object type
 * @returns True if type is one of those
 */
export function isDeviceTreeType(type: string): boolean {
  return isDeviceClass(type) || type.endsWith("Chain") || type === "DrumPad";
}

/**
 * What to call the object a message is about, in the words the tools publish.
 * Live's class names — `DrumChain`, `Eq8Device` — are spellings no tool hands
 * out anywhere else, so a result never shows one.
 * @param type - Live's class name for the object
 * @returns The words for it, with its article ("a chain")
 */
export function liveObjectWords(type: string): string {
  const word = PROSE_WORDS[type] ?? publishedType(type as LiveObjectType);

  return word == null ? "this object" : `a ${word}`;
}

/**
 * The refusal for an object a device tool can't act on.
 * @param verb - What the tool was asked to do ("read", "update")
 * @param target - The object the call reached
 * @returns The message, e.g. `cannot read a track: id 5`
 */
export function wrongTargetTypeMessage(verb: string, target: LiveAPI): string {
  return `cannot ${verb} ${liveObjectWords(target.type)}: ${targetLabel(target)}`;
}
