// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { intervalsToPitchClasses } from "#src/shared/pitch.ts";
import { parseTimeSignature } from "#src/tools/shared/helpers/live-api-values.ts";
import { unwrapSingleResult } from "#src/tools/shared/helpers/target-entries.ts";
import { validateTempo } from "#src/tools/shared/helpers/tempo-validation.ts";
import { loneRefusal } from "#src/tools/shared/validation/lists/named-targets.ts";
import { deleteLocator } from "./helpers/locator-deletes.ts";
import {
  laterNamings,
  namedLaterEntry,
} from "./helpers/locator-later-namings.ts";
import {
  attemptLocator,
  type LocatorOperation,
  type LocatorTarget,
  locatorTargets,
  type SongMeter,
} from "./helpers/locator-targets.ts";
import {
  createLocator,
  renameLocator,
  validateLocatorOperation,
} from "./helpers/locator-updates.ts";
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

  const liveSet = LiveAPI.from(livePath.liveSet);

  // Parse timeSignature up front so a malformed format fails before any
  // property is mutated, instead of throwing after a partial update (e.g. tempo
  // already applied). Mirrors updateClip's upfront validation.
  const parsedTimeSignature =
    timeSignature != null ? parseTimeSignature(timeSignature) : null;

  // Split the locator lists before anything is written: an unreadable list or
  // time is refused with the Set untouched. Times are read in the meter this
  // call leaves the Set in.
  const targets =
    locatorOperation == null
      ? []
      : locatorTargets(
          locatorOperation,
          { locatorId, locatorTime, locatorName },
          liveSet,
          parsedTimeSignature == null
            ? readMeter(liveSet)
            : {
                timeSigNumerator: parsedTimeSignature.numerator,
                timeSigDenominator: parsedTimeSignature.denominator,
              },
        );

  // optimistic result object that only include properties that are actually set
  const result: Record<string, unknown> = {
    id: liveSet.id,
  };

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
    applyScale(liveSet, parsedScale, scale, result);

    result.$meta = [
      parsedScale == null
        ? "Scale disabled for selected clips and defaults for new clips."
        : "Scale applied to selected clips and defaults for new clips.",
    ];
  }

  if (parsedScale != null) {
    // Only Live knows a scale name's intervals, so that read stays. The root is
    // the pitch class the call just wrote, so don't read it back.
    const scaleIntervals = liveSet.getProperty("scale_intervals") as number[];

    result.scalePitches = intervalsToPitchClasses(
      scaleIntervals,
      parsedScale.scaleRootNumber,
    ).join(",");
  }

  // Handle locator operations
  if (locatorOperation != null) {
    result.locator = await handleLocatorOperations(
      liveSet,
      locatorOperation as LocatorOperation,
      targets,
      context,
      tempo == null && timeSignature == null && scale == null,
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
 * @param locatorsOnly - Whether the locators are all the call asked for
 * @returns The locator's result when one was named, otherwise one entry each
 * @throws Error when a lone locator got nothing done and nothing else was asked
 */
async function handleLocatorOperations(
  liveSet: LiveAPI,
  operation: LocatorOperation,
  targets: LocatorTarget[],
  context: UpdateLiveSetContext,
  locatorsOnly: boolean,
): Promise<unknown> {
  // Read again: the meter Live holds now, after any timeSignature write.
  const meter = readMeter(liveSet);
  const namings =
    targets.length > 1 ? laterNamings(liveSet, targets, meter) : [];
  const entries: Array<Record<string, unknown>> = [];

  // Sequential: each operation moves the playhead, so they can't overlap.
  for (const [index, target] of targets.entries()) {
    const naming = namings[index];

    if (naming != null) {
      entries.push(namedLaterEntry(operation, target, naming));
      continue;
    }

    const run = async (): Promise<Record<string, unknown>> => {
      switch (operation) {
        case "create":
          return await createLocator(liveSet, target, meter, context);
        case "delete":
          return await deleteLocator(liveSet, target, meter);
        default:
          return renameLocator(liveSet, target, meter);
      }
    };

    entries.push(await attemptLocator(target, run));
  }

  // A lone refusal throws, unless tempo or other song state landed: an error
  // would hide that.
  const refusal = locatorsOnly ? loneRefusal(entries) : null;

  if (refusal != null) {
    throw new Error(refusal);
  }

  return unwrapSingleResult(entries);
}

/**
 * The song meter Live holds.
 * @param liveSet - The live_set LiveAPI object
 * @returns The meter a bar|beat is read in
 */
function readMeter(liveSet: LiveAPI): SongMeter {
  return {
    timeSigNumerator: liveSet.getProperty("signature_numerator") as number,
    timeSigDenominator: liveSet.getProperty("signature_denominator") as number,
  };
}
