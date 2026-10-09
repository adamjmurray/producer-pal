// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { joinDetails } from "#src/tools/shared/helpers/entry-details.ts";
import { landedColor } from "#src/tools/shared/helpers/landed-color.ts";
import {
  applyTempoProperty,
  applyTimeSignatureProperty,
  readBackSceneTimeSignature,
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

  const kept = readBackSceneTimeSignature(scene, timeSignature);
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
