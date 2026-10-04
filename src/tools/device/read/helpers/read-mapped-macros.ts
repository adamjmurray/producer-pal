// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Which macros of each rack a read found are mapped. Only the Producer Pal
// remote script can say; without it a rack reports just whether it has any.

import { lookUpMappedMacros } from "#src/tools/shared/device/rack-macro-mappings.ts";
import { isStalled } from "#src/tools/shared/remote-script/device-batch-route.ts";
import { READ_DETAIL_MAX_WAIT_MS } from "#src/tools/shared/remote-script/remote-script-wait.ts";
import { findInReadResult } from "./find-in-read-result.ts";

/** A rack's `macros` as the read wrote it, before and after this pass. */
interface RackMacros {
  count: number;
  hasMappings?: boolean;
  mapped?: number[];
  hiddenMapped?: number[];
}

/** A device in a read result that reports macros. */
interface MacroRack {
  id: string;
  macros: RackMacros;
}

/**
 * Replace each rack's `hasMappings` with the macros that are mapped, in one
 * remote-script call for every rack read. Racks stay as the read left them when
 * the remote script isn't running, can't answer, or can't read a rack: this is
 * extra detail, never a reason to fail the read.
 * @param results - What the read produced: devices, or skips
 * @param deadline - The request deadline from ToolContext, if any
 * @returns Whether the remote script stalled (no time, or no reply), so the
 *   next thing asked of it would stall too
 */
export async function addMappedMacros(
  results: unknown[],
  deadline: number | null | undefined,
): Promise<boolean> {
  const racks = findInReadResult(results, isMacroRack);

  if (racks.length === 0) {
    return false;
  }

  const answers = await lookUpMappedMacros(
    racks.map((rack) => LiveAPI.from(`id ${rack.id}`)),
    deadline,
    READ_DETAIL_MAX_WAIT_MS,
  );

  for (const [i, rack] of racks.entries()) {
    const answer = answers?.[i];

    if (answer != null && "mapped" in answer) {
      reportMapped(rack.macros, answer.mapped);
    }
  }

  return answers?.some(isStalled) ?? false;
}

// --- Helpers below main exports ---

/**
 * Say which macros are mapped, telling the ones beyond the visible count apart.
 * @param macros - The rack's `macros`, updated in place
 * @param mapped - The mapped macros' numbers, 1-based
 */
function reportMapped(macros: RackMacros, mapped: number[]): void {
  const hidden = mapped.filter((number) => number > macros.count);

  delete macros.hasMappings;
  macros.mapped = mapped.filter((number) => number <= macros.count);

  if (hidden.length > 0) {
    macros.hiddenMapped = hidden;
  }
}

/**
 * Whether a read result is a rack that reports macros.
 * @param record - A read result
 * @returns True for a device with an id and `macros`
 */
function isMacroRack(record: object): record is MacroRack {
  const { id, macros } = record as Partial<MacroRack>;

  return (
    typeof id === "string" &&
    macros != null &&
    typeof macros === "object" &&
    typeof macros.count === "number"
  );
}
