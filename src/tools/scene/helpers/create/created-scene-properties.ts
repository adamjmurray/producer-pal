// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { joinDetails } from "#src/tools/shared/helpers/entry-details.ts";
import { landedColor } from "#src/tools/shared/helpers/landed-color.ts";
import { parseTimeSignature } from "#src/tools/shared/helpers/live-api-values.ts";
import { readBackDetail } from "#src/tools/shared/helpers/read-back-comparison.ts";
import { type ListEntries } from "#src/tools/shared/validation/lists/list-pairing.ts";
import {
  applyTempoProperty,
  applyTimeSignatureProperty,
  validateTimeSignatures,
} from "../scene-tempo-signature.ts";

/** What a create call sets on a scene once it exists. */
export interface SceneProperties {
  color?: string;
  tempo?: number | null;
  timeSignature?: string | null;
}

/** What a scene's entry says about the values it ended up with. */
export interface AppliedSceneProperties {
  /** The palette color Live settled on, when it isn't the one asked for */
  color?: string;
  /** The time signature Live kept, when it isn't the one asked for */
  timeSignature?: string;
  detail?: string;
}

/**
 * Refuse a time signature that is malformed, or that Live can't keep, before
 * any scene is made. Live rounds a denominator that isn't a power of two to one
 * that is ("4/3" becomes 4/2), which is no scene the caller asked for.
 * @param value - The raw timeSignature param
 * @param parsed - The split time signatures, or null
 * @throws Error when an entry isn't "disabled" or a time signature Live keeps
 */
export function validateCreatedTimeSignatures(
  value: string | null | undefined,
  parsed: ListEntries | null,
): void {
  validateTimeSignatures(value, parsed);

  for (const entry of parsed ?? (value == null ? [] : [value])) {
    if (entry === "disabled") {
      continue;
    }

    const { denominator } = parseTimeSignature(entry);

    if ((denominator & (denominator - 1)) !== 0) {
      throw new Error(
        `timeSignature "${entry}" has a denominator Live can't keep; use a power of two (e.g. "4/4", "6/8")`,
      );
    }
  }
}

/**
 * Sets a scene's color, tempo and time signature, and reads back what Live kept
 * of the color and the time signature.
 * @param scene - The LiveAPI scene object
 * @param props - Properties to apply
 * @param landed - Told after each property lands, so a later throw can say so
 * @returns What the scene's entry says about the values that aren't as asked
 */
export function applySceneProperties(
  scene: LiveAPI,
  props: SceneProperties,
  landed: (phrase: string) => void,
): AppliedSceneProperties {
  const { color, tempo, timeSignature } = props;
  const colorLanded = color == null ? {} : setColor(scene, color, landed);

  if (tempo != null) {
    applyTempoProperty(scene, tempo);
    landed("tempo");
  }

  if (timeSignature == null) {
    return colorLanded;
  }

  applyTimeSignatureProperty(scene, timeSignature);
  landed("time signature");

  const kept = keptTimeSignature(scene, timeSignature);
  const detail = joinDetails([colorLanded.detail, kept.detail]);

  return {
    ...colorLanded,
    ...kept,
    ...(detail == null ? {} : { detail }),
  };
}

// --- Helpers below main export ---

function setColor(
  scene: LiveAPI,
  color: string,
  landed: (phrase: string) => void,
): AppliedSceneProperties {
  scene.setColor(color);
  landed("color");

  return landedColor(scene, color);
}

/**
 * The time signature Live kept, when it isn't the one written.
 * @param scene - The LiveAPI scene object
 * @param requested - What was written: "N/D", or "disabled"
 * @returns The signature and why it is shown, or nothing when it is as asked
 */
function keptTimeSignature(
  scene: LiveAPI,
  requested: string,
): AppliedSceneProperties {
  if (requested === "disabled") {
    return {};
  }

  const asked = parseTimeSignature(requested);
  const numerator = scene.getProperty("time_signature_numerator");
  const denominator = scene.getProperty("time_signature_denominator");

  // Nothing came back to compare with, so nothing is claimed about the write.
  if (typeof numerator !== "number" || typeof denominator !== "number") {
    return {};
  }

  if (numerator === asked.numerator && denominator === asked.denominator) {
    return {};
  }

  return {
    timeSignature: `${numerator}/${denominator}`,
    detail: readBackDetail(["timeSignature"]),
  };
}
