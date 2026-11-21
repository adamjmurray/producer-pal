// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { scaleIntervalsMask } from "#src/tools/shared/schema/scale/scale-intervals.ts";
import { type ScaleRequest } from "#src/tools/shared/schema/scale/scale-parsing.ts";
import { type CallScale } from "#src/tools/shared/schema/scale/call-scale.ts";

/**
 * The mask a new clip's transform snaps to. The clip isn't made yet, so it can't
 * be read: it will have the scale the call asks for, or else the Live Set's,
 * which every new clip starts with. Where Live gives clips no scale, the Live
 * Set's is the only one.
 * @param callScale - What the call asked Live about scales
 * @param request - The scale the clip is asked to take, if any
 * @returns The mask, or undefined when the clip has no scale or a chromatic one
 */
export function newClipScaleMask(
  callScale: CallScale,
  request: ScaleRequest | undefined,
): number | undefined {
  if (request == null || !callScale.supported()) {
    return callScale.song().mask;
  }

  return request.parsed == null
    ? undefined
    : scaleIntervalsMask(request.parsed);
}
