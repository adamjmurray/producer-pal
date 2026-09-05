// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";

/**
 * Shared `sends` input schema for ppal-update-track / ppal-update-device.
 *
 * A track sends to the Live Set's return tracks and a rack chain to its rack's
 * return chains, but the entry is the same either way, so the shape is written
 * once. Callers add their own `.describe(...)` for tool-specific wording.
 */
export const sendsInputSchema = z
  .array(
    z.object({
      return: z.coerce.string(),
      gainDb: z.coerce.number().min(-70).max(0),
    }),
  )
  .optional();

/** One entry of a `sends` list: a return, named any way it accepts, and a level. */
export type SendEntry = NonNullable<z.infer<typeof sendsInputSchema>>[number];
