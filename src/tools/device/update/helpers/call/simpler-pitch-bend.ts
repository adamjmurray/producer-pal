// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A Simpler's `pitchBendRange` and `notePitchBendRange` params. Max can't set
// them, so the write goes through the Producer Pal remote script, which the sync
// param write can't wait on. They are written here, ahead of the rest of the
// target's update, and each param entry is handed on with what it came to.

import { REMOTE_SCRIPT_SETUP } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import {
  type ParamEntry,
  paramEntryKey,
} from "#src/tools/device/update/device-params-schema.ts";
import {
  type ParamOutcome,
  skippedParam,
} from "#src/tools/shared/device/helpers/param-reading.ts";
import { coerceInt } from "#src/tools/shared/device/specialized/specialized-param-access.ts";
import {
  NOTE_PITCH_BEND_RANGE_MAX,
  PITCH_BEND_RANGE_MAX,
} from "#src/tools/shared/remote-script/simpler-settings-contract.ts";
import {
  type SimplerSettings,
  type SimplerSettingsChange,
  writeSimplerSettings,
} from "#src/tools/shared/remote-script/simpler-settings.ts";
import { unreachedDetail } from "#src/tools/shared/validation/lists/named-targets.ts";

/** Each param entry a write was settled for, with what it came to. */
export type SettledParams = Map<ParamEntry, ParamOutcome[]>;

/** Set once a write gets no answer, so the targets after it aren't tried. */
export interface PitchBendStall {
  reason?: string;
}

/** What the write needs from the call. */
interface PitchBendCall {
  deadline: number | null | undefined;
  /** Told that a write may have changed Live, for a later throw to say so */
  landed: (phrase: string) => void;
}

/** One param entry that names a setting, and what it asks for. */
interface PitchBendEntry {
  entry: ParamEntry;
  setting: keyof SimplerSettings;
  /** The name as the call spelled it */
  key: string;
}

const SETTINGS: Array<{ setting: keyof SimplerSettings; max: number }> = [
  { setting: "pitchBendRange", max: PITCH_BEND_RANGE_MAX },
  { setting: "notePitchBendRange", max: NOTE_PITCH_BEND_RANGE_MAX },
];

/**
 * Whether a target is a Simpler, the only device with these settings.
 * @param type - Live object type
 * @returns True for a SimplerDevice
 */
export function isSimplerDevice(type: string): boolean {
  return type === "SimplerDevice";
}

/**
 * Write the pitch bend params a Simpler's `params` names, in one remote-script
 * call. An entry named again later is left to the setter, which marks it
 * overridden; only the last of each setting is written.
 * @param target - The target
 * @param params - The call's `params`
 * @param stall - What the call has found out about the remote script so far
 * @param call - The request deadline, and what to tell of a write that may
 *   have landed
 * @returns What each written entry came to; undefined when there was nothing
 *   to write, so the caller stays sync
 */
export function writePitchBendParams(
  target: LiveAPI,
  params: ParamEntry[] | undefined,
  stall: PitchBendStall,
  call: PitchBendCall,
): Promise<SettledParams> | undefined {
  const entries = isSimplerDevice(target.type)
    ? pitchBendEntries(params ?? [])
    : [];

  return entries.length === 0
    ? undefined
    : settle(target, entries, stall, call);
}

// --- Helpers below main exports ---

/**
 * The last entry for each pitch bend setting.
 * @param params - The call's `params`
 * @returns The entries that win, in the order sent
 */
function pitchBendEntries(params: ParamEntry[]): PitchBendEntry[] {
  const found: PitchBendEntry[] = [];

  for (const { setting } of SETTINGS) {
    const last = params.findLast((entry) => {
      const { key, byId } = paramEntryKey(entry);

      return !byId && key.toLowerCase() === setting.toLowerCase();
    });

    if (last != null) {
      found.push({ entry: last, setting, key: paramEntryKey(last).key });
    }
  }

  return found.toSorted(
    (a, b) => params.indexOf(a.entry) - params.indexOf(b.entry),
  );
}

/**
 * Write what can be written and say what each entry came to.
 * @param target - The Simpler
 * @param entries - The entries that win
 * @param stall - What the call has found out about the remote script so far
 * @param call - The request deadline, and what to tell of a write that may
 *   have landed
 * @returns What each entry came to
 */
async function settle(
  target: LiveAPI,
  entries: PitchBendEntry[],
  stall: PitchBendStall,
  call: PitchBendCall,
): Promise<SettledParams> {
  const settled: SettledParams = new Map();
  const change: SimplerSettingsChange = {};
  const asked: PitchBendEntry[] = [];

  for (const item of entries) {
    const refused = refuseValue(item);

    if (refused != null) {
      settled.set(item.entry, [skippedParam(item.key, refused)]);
    } else {
      change[item.setting] = Number(item.entry.value.trim());
      asked.push(item);
    }
  }

  if (asked.length === 0) {
    return settled;
  }

  if (stall.reason != null) {
    return refuseAll(settled, asked, stall.reason);
  }

  const write = await writeSimplerSettings(target, change, call.deadline);

  if (write.ok) {
    call.landed("pitch bend range");

    for (const { entry, setting } of asked) {
      settled.set(entry, [landedParam(setting, change, write.result)]);
    }

    return settled;
  }

  if (!write.available) {
    return refuseAll(
      settled,
      asked,
      write.outdated === true
        ? write.reason
        : `needs the Producer Pal remote script, which isn't answering; ${REMOTE_SCRIPT_SETUP}`,
    );
  }

  if (write.stalled === "out-of-time") {
    stall.reason = unreachedDetail("target", "not set");

    return refuseAll(settled, asked, stall.reason);
  }

  if (write.stalled === "unanswered") {
    // The write may have reached Live before the wait ran out.
    call.landed("pitch bend range");
    stall.reason =
      "not set: the remote script didn't answer an earlier Simpler's write; re-run for this target";

    return refuseAll(
      settled,
      asked,
      `may have changed: ${write.reason}; read the device to check`,
    );
  }

  return refuseAll(settled, asked, `not set: ${write.reason}`);
}

/**
 * Why a value can't be written: not a whole number in the setting's range.
 * @param item - The entry that names the setting
 * @returns The reason, or null when it can be written
 */
function refuseValue(item: PitchBendEntry): string | null {
  const { entry, setting, key } = item;
  const max = SETTINGS.find((s) => s.setting === setting)?.max ?? 0;
  const raw = entry.value.trim();
  const int = coerceInt(raw);

  return int == null || int < 0 || int > max
    ? `${key} must be an integer 0-${max} (got "${raw}")`
    : null;
}

/**
 * The outcome for a setting that was written: its name, and what it reads back.
 * @param setting - The setting
 * @param asked - What the write asked for
 * @param landed - Both settings as the remote script read them back
 * @returns The outcome
 */
function landedParam(
  setting: keyof SimplerSettings,
  asked: SimplerSettingsChange,
  landed: SimplerSettings,
): ParamOutcome {
  return {
    name: setting,
    read: () => landed[setting],
    writeFailed: (readBack) =>
      readBack === asked[setting]
        ? undefined
        : `landed at ${String(readBack)}, not ${String(asked[setting])}`,
  };
}

/**
 * Give every entry asked the same refusal.
 * @param settled - What is settled so far, added to
 * @param asked - The entries that were to be written
 * @param reason - Why none was
 * @returns The settled entries
 */
function refuseAll(
  settled: SettledParams,
  asked: PitchBendEntry[],
  reason: string,
): SettledParams {
  for (const { entry, key } of asked) {
    settled.set(entry, [skippedParam(key, reason)]);
  }

  return settled;
}
