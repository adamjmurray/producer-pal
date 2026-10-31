// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { z } from "zod";
import {
  splitEntries,
  unescapeCommas,
} from "#src/tools/shared/validation/lists/split-entries.ts";
import { deprecatedParam } from "#src/tools/shared/tool-framework/hidden-param.ts";

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

/**
 * The deprecated `sendGainDb` + `sendReturn` pair, for the tools that publish
 * `sends`. Both are still honored and warn, naming the `sends` call this one
 * means. Spread into the tool's input schema.
 */
export const deprecatedSendParams = {
  sendGainDb: deprecatedParam(z.coerce.number().min(-70).max(0).optional(), {
    replacedBy: "sends",
    note: sendsReplacement,
  }),
  sendReturn: deprecatedParam(z.coerce.string().optional(), {
    replacedBy: "sends",
    note: sendsReplacement,
  }),
};

/**
 * Say what to send in place of the pair, built from the call's own values.
 * `sends` applies one list to every target, so a `sendReturn` that pairs a
 * return per target has no single-call equivalent.
 * @param args - The args the call sent
 * @returns The note, ending the deprecation warning
 */
function sendsReplacement(args: Record<string, unknown>): string {
  const { sendGainDb, sendReturn } = args;
  const lead = "Replace sendGainDb and sendReturn with sends: ";

  if (typeof sendReturn === "string" && splitEntries(sendReturn).length > 1) {
    return `${lead}[{return, gainDb}]. sends sets the same entries on every target, so make one call per return`;
  }

  return typeof sendReturn === "string" && typeof sendGainDb === "number"
    ? `${lead}${JSON.stringify([{ return: unescapeCommas(sendReturn.trim()), gainDb: sendGainDb }])}`
    : `${lead}[{return, gainDb}]`;
}
