// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The per-clip string params: each one splits on commas and pairs 1:1 with the
// targets the call named, the way name and color do.

import {
  type PairedParamLabels,
  pairParams,
} from "#src/tools/shared/validation/lists/paired-values.ts";

/** The per-clip string params, as one update-clip call sent them. */
export interface ClipValueArgs {
  timeSignature?: string;
  start?: string;
  length?: string;
  firstStart?: string;
  quantizePitch?: string;
}

const LABELS: PairedParamLabels<keyof ClipValueArgs> = {
  timeSignature: {
    param: "timeSignature",
    noun: "time signature",
    item: "clip",
    shortfall: "kept the meter they had",
  },
  start: {
    param: "start",
    noun: "position",
    item: "clip",
    shortfall: "kept the region they had",
  },
  length: {
    param: "length",
    noun: "length",
    item: "clip",
    shortfall: "kept the length they had",
  },
  firstStart: {
    param: "firstStart",
    noun: "position",
    item: "clip",
    shortfall: "kept the playback start they had",
  },
  quantizePitch: {
    param: "quantizePitch",
    noun: "pitch",
    item: "clip",
    shortfall: "quantized every pitch",
  },
};

/**
 * Split each per-clip param against the targets the call named.
 * @param args - The tool arguments as received
 * @param count - How many targets the call named
 * @returns The per-clip params for the target at an index
 * @throws Error when a list has an empty entry
 */
export function clipValuesAt(
  args: ClipValueArgs,
  count: number,
): (index: number) => ClipValueArgs {
  return pairParams(args, LABELS, count);
}
