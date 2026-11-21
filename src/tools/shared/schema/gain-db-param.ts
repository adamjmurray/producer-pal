// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { z } from "zod";

/** The bottom of a fader in dB, which Live shows and reads back as "-inf". */
const FADER_FLOOR_DB = -70;

/**
 * A fader level in dB for a track, rack chain or send. A read reports the
 * bottom of the fader as "-inf", so a write takes that text too, or a value
 * read off one object couldn't be written to another.
 * @param max - The top of the fader's range in dB
 * @returns The schema, which publishes as a plain number
 */
export function gainDbParam(max: number): z.ZodType<number> {
  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().toLowerCase() === "-inf"
        ? FADER_FLOOR_DB
        : value,
    z.coerce.number().min(FADER_FLOOR_DB).max(max),
  );
}
