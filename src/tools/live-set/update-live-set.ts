// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  barBeatToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { intervalsToPitchClasses } from "#src/shared/pitch.ts";
import { findLocator } from "#src/tools/shared/locator/locators.ts";
import { parseTimeSignature } from "#src/tools/shared/helpers/live-api-values.ts";
import { unwrapSingleResult } from "#src/tools/shared/helpers/target-entries.ts";
import { validateTempo } from "#src/tools/shared/helpers/tempo-validation.ts";
import {
  attemptLocator,
  type LocatorTarget,
  locatorTargets,
} from "./helpers/locator-targets.ts";
import {
  deleteLocator,
  renameLocator,
  stopPlaybackIfNeeded,
  validateLocatorOperation,
  waitForPlayheadPosition,
} from "./helpers/locator-updates.ts";
import {
  cleanupTempClip,
  extendSongIfNeeded,
} from "./helpers/song-extension.ts";
import {
  applyScale,
  applyTempo,
  applyTimeSignature,
  parseScale,
} from "./helpers/tempo-and-scale-updates.ts";

interface UpdateLiveSetArgs {
  tempo?: number;
  timeSignature?: string;
  scale?: string;
  locatorOperation?: string;
  locatorId?: string;
  locatorTime?: string;
  locatorName?: string;
}

interface CreateLocatorOptions {
  locatorTime?: string;
  locatorName?: string;
  timeSigNumerator: number;
  timeSigDenominator: number;
}

// silenceWavPath is available on context at runtime but not declared in ToolContext
type UpdateLiveSetContext = Partial<ToolContext> & { silenceWavPath?: string };

/**
 * Updates Live Set parameters like tempo, time signature, scale, and locators.
 * Note: Scale changes affect currently selected clips and set defaults for new clips.
 * @param args - The parameters
 * @param args.tempo - Set tempo in BPM (20.0-999.0)
 * @param args.timeSignature - Time signature in format "4/4"
 * @param args.scale - Scale in format "Root ScaleName"
 * @param args.locatorOperation - Locator operation: "create", "delete", or "rename"
 * @param args.locatorId - Locator ID(s) for delete/rename, comma-separated
 * @param args.locatorTime - Bar|beat position(s) for create/delete/rename, comma-separated
 * @param args.locatorName - Name(s) for create/rename, or name filter(s) for delete
 * @param context - Internal context object with silenceWavPath for audio clips
 * @returns Updated Live Set information
 */
export async function updateLiveSet(
  {
    tempo,
    timeSignature,
    scale,
    locatorOperation,
    locatorId,
    locatorTime,
    locatorName,
  }: UpdateLiveSetArgs = {},
  context: UpdateLiveSetContext = {},
): Promise<Record<string, unknown>> {
  validateLocatorOperation(locatorOperation, {
    locatorId,
    locatorTime,
    locatorName,
  });

  // Split the locator lists before anything is written: an unreadable list is
  // refused with the Set untouched.
  const targets =
    locatorOperation == null
      ? []
      : locatorTargets(locatorOperation, {
          locatorId,
          locatorTime,
          locatorName,
        });

  const liveSet = LiveAPI.from(livePath.liveSet);

  // optimistic result object that only include properties that are actually set
  const result: Record<string, unknown> = {
    id: liveSet.id,
  };

  // Parse timeSignature up front so a malformed format fails before any
  // property is mutated, instead of throwing after a partial update (e.g. tempo
  // already applied). Mirrors updateClip's upfront validation.
  const parsedTimeSignature =
    timeSignature != null ? parseTimeSignature(timeSignature) : null;

  // The scale covers the whole call, so one we can't read is refused here too,
  // with the Set untouched. An empty string means disable, not a bad scale.
  const parsedScale = scale == null || scale === "" ? null : parseScale(scale);

  validateTempo(tempo);

  if (tempo != null) {
    applyTempo(liveSet, tempo, result);
  }

  if (parsedTimeSignature != null) {
    applyTimeSignature(liveSet, parsedTimeSignature, result);
  }

  if (scale != null) {
    const respelledRoot = applyScale(liveSet, parsedScale, result);
    const meta = [
      parsedScale == null
        ? "Scale disabled for selected clips and defaults for new clips."
        : "Scale applied to selected clips and defaults for new clips.",
    ];

    // Without this, a model that asked for F# sees Gb come back and retries,
    // thinking the write failed.
    if (respelledRoot != null) {
      meta.push(
        `Scale roots are spelled with flats, so ${respelledRoot.requestedRoot} comes back as ${respelledRoot.storedRoot} — same scale, set correctly.`,
      );
    }

    result.$meta = meta;
  }

  if (parsedScale != null) {
    const rootNote = liveSet.getProperty("root_note") as number;
    const scaleIntervals = liveSet.getProperty("scale_intervals") as number[];

    result.scalePitches = intervalsToPitchClasses(scaleIntervals, rootNote);
  }

  // Handle locator operations
  if (locatorOperation != null) {
    result.locator = await handleLocatorOperations(
      liveSet,
      locatorOperation,
      targets,
      context,
    );
  }

  return result;
}

/**
 * Run the operation on every locator the call named, in order.
 * @param liveSet - The live_set LiveAPI object
 * @param operation - "create", "delete", or "rename"
 * @param targets - One target per locator named
 * @param context - Context object with silenceWavPath
 * @returns The locator's result when one was named, otherwise one entry each
 */
async function handleLocatorOperations(
  liveSet: LiveAPI,
  operation: string,
  targets: LocatorTarget[],
  context: UpdateLiveSetContext,
): Promise<unknown> {
  const timeSigNumerator = liveSet.getProperty("signature_numerator") as number;
  const timeSigDenominator = liveSet.getProperty(
    "signature_denominator",
  ) as number;

  const entries: Array<Record<string, unknown>> = [];

  // Sequential: each operation moves the playhead, so they can't overlap.
  for (const target of targets) {
    const run = (): Promise<Record<string, unknown>> =>
      runLocatorOperation(
        liveSet,
        operation,
        { ...target, timeSigNumerator, timeSigDenominator },
        context,
      );

    entries.push(
      targets.length > 1 ? await attemptLocator(target, run) : await run(),
    );
  }

  return unwrapSingleResult(entries);
}

/**
 * Run one locator operation (create, delete, rename)
 * @param liveSet - The live_set LiveAPI object
 * @param operation - "create", "delete", or "rename"
 * @param options - The locator and the song meter its position is read in
 * @param options.locatorId - Locator ID for delete/rename
 * @param options.locatorTime - Bar|beat position
 * @param options.locatorName - Name for create/rename or name filter for delete
 * @param options.timeSigNumerator - Time signature numerator
 * @param options.timeSigDenominator - Time signature denominator
 * @param context - Context object with silenceWavPath
 * @returns Result of the locator operation
 */
async function runLocatorOperation(
  liveSet: LiveAPI,
  operation: string,
  {
    locatorId,
    locatorTime,
    locatorName,
    timeSigNumerator,
    timeSigDenominator,
  }: LocatorTarget & {
    timeSigNumerator: number;
    timeSigDenominator: number;
  },
  context: UpdateLiveSetContext,
): Promise<Record<string, unknown>> {
  switch (operation) {
    case "create":
      return await createLocator(
        liveSet,
        { locatorTime, locatorName, timeSigNumerator, timeSigDenominator },
        context,
      );
    case "delete":
      return await deleteLocator(liveSet, {
        locatorId,
        locatorTime,
        locatorName,
        timeSigNumerator,
        timeSigDenominator,
      });
    case "rename":
      return renameLocator(liveSet, {
        locatorId,
        locatorTime,
        locatorName,
        timeSigNumerator,
        timeSigDenominator,
      });
    default:
      throw new Error(`Unknown locator operation: ${operation}`);
  }
}

/**
 * Create a locator at the specified position
 * @param liveSet - The live_set LiveAPI object
 * @param options - Create options
 * @param options.locatorTime - Bar|beat position for the locator
 * @param options.locatorName - Optional name for the locator
 * @param options.timeSigNumerator - Time signature numerator
 * @param options.timeSigDenominator - Time signature denominator
 * @param context - Context object with silenceWavPath
 * @returns Created locator info
 */
async function createLocator(
  liveSet: LiveAPI,
  {
    locatorTime,
    locatorName,
    timeSigNumerator,
    timeSigDenominator,
  }: CreateLocatorOptions,
  context: UpdateLiveSetContext,
): Promise<Record<string, unknown>> {
  if (locatorTime == null) {
    return {
      operation: "skipped",
      ok: false,
      reason: "create needs locatorTime",
    };
  }

  validateBarBeatPosition(locatorTime);
  const targetBeats = barBeatToAbletonBeats(
    locatorTime,
    timeSigNumerator,
    timeSigDenominator,
  );

  // Check if a locator already exists at this position
  const existing = findLocator(liveSet, { timeInBeats: targetBeats });

  if (existing) {
    return {
      operation: "skipped",
      reason: `a locator is already at ${locatorTime}`,
      time: locatorTime,
      existingId: existing.locator.id,
    };
  }

  stopPlaybackIfNeeded(liveSet);

  // Extend song if target is past current song_length
  const tempClipInfo = extendSongIfNeeded(liveSet, targetBeats, context);

  // Move playhead and wait for it to update (race condition fix)
  liveSet.set("current_song_time", targetBeats);
  await waitForPlayheadPosition(liveSet, targetBeats);

  // Create locator at current playhead position
  liveSet.call("set_or_delete_cue");

  // Clean up temporary clip used to extend song
  cleanupTempClip(tempClipInfo);

  // Find the newly created locator to get its index and set name if provided
  const found = findLocator(liveSet, { timeInBeats: targetBeats });

  if (found && locatorName != null) {
    found.locator.set("name", locatorName);
  }

  return {
    operation: "created",
    ...(found && { id: found.locator.id }),
  };
}
