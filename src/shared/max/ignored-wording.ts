// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The one wording for a param that did nothing: `X ignored: reason`. A
// whole-call warning and a target's entry detail read the same.

import * as console from "./v8-max-console.ts";

/** Why a clip can't take a MIDI-only param. */
export const CLIP_IS_AUDIO = "the clip is audio";

/** Why a clip can't take an audio-only param. */
export const CLIP_IS_MIDI = "the clip is MIDI";

/** Why a clip can't take an arrangement-only param. */
export const SESSION_CLIP = "this is a session clip";

/**
 * The text saying params did nothing, for a warning or an entry's detail.
 * @param params - The param, or the params, in the caller's spelling
 * @param why - Why they did nothing
 * @returns `X ignored: reason`, with several params joined by ", "
 */
export function ignoredText(
  params: string | readonly string[],
  why: string,
): string {
  const named = typeof params === "string" ? params : params.join(", ");

  return `${named} ignored: ${why}`;
}

/**
 * Warn that a whole-call param did nothing.
 * @param params - The param, or the params, in the caller's spelling
 * @param why - Why they did nothing
 */
export function warnIgnored(
  params: string | readonly string[],
  why: string,
): void {
  console.warn(ignoredText(params, why));
}
