// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A Simpler's pitch bend ranges, listed among its params. Only the Producer Pal
// remote script can read them; without it the Simpler reads as it always did.

import { DEVICE_CLASS } from "#src/tools/constants.ts";
import { READ_DETAIL_MAX_WAIT_MS } from "#src/tools/shared/remote-script/remote-script-wait.ts";
import { lookUpSimplerSettings } from "#src/tools/shared/remote-script/simpler-settings.ts";
import { findInReadResult } from "./find-in-read-result.ts";

/** A Simpler in a read result that listed its params. */
interface ReadSimpler {
  id: string;
  type: string;
  parameters: Array<Record<string, unknown>>;
}

/**
 * Add `pitchBendRange` and `notePitchBendRange` to the params of each Simpler a
 * read listed them for, in one remote-script call for all of them. A Simpler
 * stays as the read left it when the remote script isn't running, can't answer,
 * or can't read it: this is extra detail, never a reason to fail the read.
 * @param results - What the read produced: devices, or skips
 * @param deadline - The request deadline from ToolContext, if any
 * @param paramSearch - The read's param name filter, which the added params
 *   answer to like any other
 */
export async function addSimplerSettings(
  results: unknown[],
  deadline: number | null | undefined,
  paramSearch?: string,
): Promise<void> {
  const simplers = findInReadResult(results, isReadSimpler);
  const shown = (name: string): boolean =>
    !paramSearch ||
    name.toLowerCase().includes(paramSearch.toLowerCase().trim());

  if (simplers.length === 0 || !SETTING_NAMES.some(shown)) {
    return;
  }

  const answers = await lookUpSimplerSettings(
    simplers.map((simpler) => LiveAPI.from(`id ${simpler.id}`)),
    deadline,
    READ_DETAIL_MAX_WAIT_MS,
  );

  for (const [i, simpler] of simplers.entries()) {
    const answer = answers?.[i];

    if (answer != null && "pitchBendRange" in answer) {
      const added = SETTING_NAMES.filter(shown).map((name) => ({
        name,
        value: answer[name],
      }));
      // After the other pseudo-params, which have no id, and before the
      // DeviceParameters.
      const first = simpler.parameters.findIndex((param) => "id" in param);

      simpler.parameters.splice(
        first < 0 ? simpler.parameters.length : first,
        0,
        ...added,
      );
    }
  }
}

// --- Helpers below main exports ---

const SETTING_NAMES = ["pitchBendRange", "notePitchBendRange"] as const;

/**
 * Whether a read result is a Simpler that listed its params. A read without
 * them (a bare list of devices) shouldn't wait on the remote script.
 * @param record - A read result
 * @returns True for a Simpler with an id and a `parameters` list
 */
function isReadSimpler(record: object): record is ReadSimpler {
  const { id, type, parameters } = record as Partial<ReadSimpler>;

  return (
    typeof id === "string" &&
    type === `instrument: ${DEVICE_CLASS.SIMPLER}` &&
    Array.isArray(parameters)
  );
}
