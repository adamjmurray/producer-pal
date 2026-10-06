// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A Simpler's pitch bend ranges. Max's Live API doesn't have them; the Producer
// Pal remote script reads and writes them through Live's Python API.

import { errorMessage } from "#src/shared/error-message.ts";
import {
  type Unreadable,
  askAboutDevices,
} from "#src/tools/shared/remote-script/device-batch-route.ts";
import { REMOTE_SCRIPT_UNANSWERED } from "#src/tools/shared/remote-script/remote-script-route-contract.ts";
import {
  type RouteOutcome,
  remoteScriptChange,
} from "#src/tools/shared/remote-script/remote-script-route.ts";
import {
  MAX_SIMPLERS_PER_CALL,
  SIMPLER_SETTINGS_ROUTES,
  type SimplerReadResult,
  type SimplerSettingsEntry,
  type SimplerWriteRequest,
} from "#src/tools/shared/remote-script/simpler-settings-contract.ts";

/** A Simpler's pitch bend ranges, in semitones. */
export interface SimplerSettings {
  /** How far the pitch wheel bends, 0-24 */
  pitchBendRange: number;
  /** MPE per-note pitch bend, 0-48 */
  notePitchBendRange: number;
}

/** The settings a write changes: one or both. */
export type SimplerSettingsChange = Partial<SimplerSettings>;

const REMOTE_SCRIPT_MISSING = "the Producer Pal remote script isn't running";

/**
 * Ask the remote script for each Simpler's pitch bend ranges, a chunk of
 * Simplers at a time. Never throws: a Simpler it can't answer for carries the
 * reason.
 * @param simplers - The Simplers to ask about
 * @param deadline - The request deadline from ToolContext, if any
 * @param maxWaitMs - A shorter wait than the usual one for each call, for a
 *   caller that can do without the answer
 * @returns One answer per Simpler, in order; null when the remote script isn't
 *   running, so there is nothing to ask
 */
export function lookUpSimplerSettings(
  simplers: LiveAPI[],
  deadline: number | null | undefined,
  maxWaitMs?: number,
): Promise<Array<SimplerSettings | Unreadable> | null> {
  return askAboutDevices<SimplerReadResult, SimplerSettings>(
    {
      route: SIMPLER_SETTINGS_ROUTES.read,
      maxPerCall: MAX_SIMPLERS_PER_CALL,
      missing: REMOTE_SCRIPT_MISSING,
      entries: (result) =>
        result.simplers.map((entry) =>
          "error" in entry ? entry : settingsOf(entry),
        ),
    },
    simplers,
    deadline,
    maxWaitMs,
  );
}

/**
 * Set a Simpler's pitch bend ranges through the remote script. Never throws.
 * A write that got no answer, or failed once the request went out, comes back
 * as `stalled: "unanswered"`, since it may still have landed. One the remote
 * script refused or skipped is a plain failure: nothing changed.
 * @param simpler - The Simpler
 * @param change - The settings to change, one or both
 * @param deadline - The request deadline from ToolContext, if any
 * @returns Both settings as the remote script read them back, or why not
 */
export async function writeSimplerSettings(
  simpler: LiveAPI,
  change: SimplerSettingsChange,
  deadline: number | null | undefined,
): Promise<RouteOutcome<SimplerSettings>> {
  const request: SimplerWriteRequest = { devicePath: simpler.path, ...change };

  try {
    const outcome = await remoteScriptChange<SimplerSettingsEntry>(
      SIMPLER_SETTINGS_ROUTES.write,
      request,
      deadline,
      REMOTE_SCRIPT_MISSING,
    );

    return outcome.ok
      ? { ok: true, result: settingsOf(outcome.result) }
      : outcome;
  } catch (error) {
    // Whether the request reached the remote script is unknown.
    return {
      ok: false,
      reason: `${REMOTE_SCRIPT_UNANSWERED} (${errorMessage(error)})`,
      available: true,
      stalled: "unanswered",
    };
  }
}

// --- Helpers below main exports ---

/**
 * Put the remote script's snake_case entry in this tool's spelling.
 * @param entry - What the remote script read from one Simpler
 * @returns The settings
 */
function settingsOf(entry: SimplerSettingsEntry): SimplerSettings {
  return {
    pitchBendRange: entry.pitch_bend_range,
    notePitchBendRange: entry.note_pitch_bend_range,
  };
}
