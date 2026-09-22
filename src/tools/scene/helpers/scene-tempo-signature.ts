// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { parseTimeSignature } from "#src/tools/shared/helpers/live-api-values.ts";
import { validateTempo } from "#src/tools/shared/helpers/tempo-validation.ts";
import { type ListEntries } from "#src/tools/shared/validation/lists/list-pairing.ts";
import { numberForIndex } from "#src/tools/shared/validation/lists/typed-lists.ts";

/**
 * Applies tempo property to a scene
 * @param scene - The LiveAPI scene object
 * @param tempo - Tempo in BPM (20.0-999.0). -1 disables; other valid values enable
 */
export function applyTempoProperty(
  scene: LiveAPI,
  tempo?: number | null,
): void {
  if (tempo === -1) {
    scene.set("tempo_enabled", false);
  } else if (tempo != null) {
    // Range already refused by validateTempo, before any scene was touched.
    scene.set("tempo", tempo);
    scene.set("tempo_enabled", true);
  }
}

/**
 * Applies time signature property to a scene
 * @param scene - The LiveAPI scene object
 * @param timeSignature - Time signature. "disabled" disables, other values enable
 */
export function applyTimeSignatureProperty(
  scene: LiveAPI,
  timeSignature?: string | null,
): void {
  if (timeSignature === "disabled") {
    scene.set("time_signature_enabled", false);
  } else if (timeSignature != null) {
    const parsed = parseTimeSignature(timeSignature);

    scene.set("time_signature_numerator", parsed.numerator);
    scene.set("time_signature_denominator", parsed.denominator);
    scene.set("time_signature_enabled", true);
  }
}

/**
 * Refuse a malformed time signature before any scene is touched, so a bad
 * entry can't leave the scenes before it already changed. "disabled" is a
 * sentinel each scene handles, not a time signature.
 * @param value - The raw timeSignature param
 * @param parsed - The split time signatures, or null
 * @throws Error when an entry isn't "disabled" or an N/D time signature
 */
export function validateTimeSignatures(
  value: string | null | undefined,
  parsed: ListEntries | null,
): void {
  const entries = parsed ?? (value == null ? [] : [value]);

  for (const entry of entries) {
    if (entry !== "disabled") {
      parseTimeSignature(entry);
    }
  }
}

/**
 * Refuse a tempo Live can't hold before any scene is touched, so a bad entry
 * can't leave the scenes before it already changed.
 * @param value - The raw tempo param
 * @param parsed - The split tempos, or null
 * @throws Error when an entry names no number, or one outside Live's range
 */
export function validateTempos(
  value: string | null | undefined,
  parsed: ListEntries | null,
): void {
  const entries = parsed ?? (value == null ? [] : [value]);

  for (let i = 0; i < entries.length; i++) {
    const tempo = numberForIndex(value ?? undefined, i, parsed);

    // With one scene the whole value is literal, so "120,90" names no number.
    if (tempo == null) {
      throw new Error(`invalid tempo "${value}" - it must be a number`);
    }

    validateTempo(tempo, -1);
  }
}
