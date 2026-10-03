// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { intervalsToPitchClasses } from "#src/shared/pitch.ts";
import { parseTimeSignature } from "#src/tools/shared/helpers/live-api-values.ts";
import { validateTempo } from "#src/tools/shared/helpers/tempo-validation.ts";
import { refuseNoWrite } from "#src/tools/shared/validation/lists/refuse-no-write.ts";
import { runWrite } from "#src/tools/shared/write-pipeline/write-pipeline.ts";
import {
  type AppliedTarget,
  type Step,
  type Target,
  type WriteSpec,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { deleteLocator } from "./helpers/locator-deletes.ts";
import {
  type LocatorPayload,
  locatorPipelineTargets,
} from "./helpers/locator-pipeline-targets.ts";
import {
  type LocatorOperation,
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
  type ParsedScale,
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

/** The call, and the place its whole-call writes leave what the result says. */
interface UpdateLiveSetRun {
  args: UpdateLiveSetArgs;
  /** Only includes properties that are actually set */
  result: Record<string, unknown>;
}

/** The call, read once. */
interface UpdateLiveSetCall {
  run: UpdateLiveSetRun;
  liveSet: LiveAPI;
  tempo?: number;
  timeSignature: { numerator: number; denominator: number } | null;
  scale?: string;
  /** Null when the scale is disabled or not sent */
  parsedScale: ParsedScale | null;
  locators: Array<Target<LocatorPayload>>;
}

/** What the call shares between its hooks. */
interface UpdateLiveSetChecked extends UpdateLiveSetCall {
  operation?: LocatorOperation;
  /** The meter Live holds once the whole-call writes have landed, read when
   * the call names locators */
  meter?: SongMeter;
}

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
  args: UpdateLiveSetArgs = {},
  context: UpdateLiveSetContext = {},
): Promise<Record<string, unknown>> {
  const run: UpdateLiveSetRun = { args, result: {} };
  const locator = await runWrite(UPDATE_LIVE_SET_WRITE, run, context);

  return {
    ...run.result,
    // One entry per locator named, in order; a lone one is unwrapped
    ...(args.locatorOperation != null && { locator }),
  };
}

const UPDATE_LIVE_SET_WRITE: WriteSpec<
  UpdateLiveSetRun,
  UpdateLiveSetCall,
  LocatorPayload,
  UpdateLiveSetChecked,
  Record<string, unknown>
> = {
  tool: "ppal-update-live-set",
  words: { rerun: "locator" },
  parse: parseUpdateLiveSet,
  targets: (call) => call.locators,
  check: (call) => ({
    ...call,
    operation: call.run.args.locatorOperation as LocatorOperation | undefined,
  }),
  before: writeSongState,
  // A lone locator refusal throws only when it was the call's only work: an
  // error would hide what else landed.
  loneSkipThrows: ({ tempo, timeSignature, scale }) =>
    tempo == null && timeSignature == null && scale == null,
  write: writeLocator,
};

// --- Helpers below main export ---

/**
 * Read the call, refusing one that is malformed before anything is written.
 * @param run - The call
 * @returns The call, with its whole-call params read
 */
function parseUpdateLiveSet(run: UpdateLiveSetRun): UpdateLiveSetCall {
  const { args } = run;

  validateLocatorOperation(args.locatorOperation, {
    locatorId: args.locatorId,
    locatorTime: args.locatorTime,
    locatorName: args.locatorName,
  });
  // Answering a call that asks for nothing reads as if it had changed something.
  refuseNoWrite(args);

  const liveSet = LiveAPI.from(livePath.liveSet);
  // Parsed up front so a malformed format fails before any property is
  // written, instead of after tempo already landed.
  const timeSignature =
    args.timeSignature == null ? null : parseTimeSignature(args.timeSignature);
  // Named before anything is written: an unreadable list or time is refused
  // with the Set untouched.
  const locators = locatorsNamed(args, liveSet, timeSignature);

  // The scale covers the whole call, so one we can't read is refused here too.
  // An empty string means disable, not a bad scale.
  const { scale, tempo } = args;
  const parsedScale = scale == null || scale === "" ? null : parseScale(scale);

  validateTempo(tempo);

  return { run, liveSet, tempo, timeSignature, scale, parsedScale, locators };
}

/**
 * The locators the call names, with their times read in the meter this call
 * leaves the Set in.
 * @param args - The call's args
 * @param liveSet - The live_set LiveAPI object
 * @param timeSignature - The time signature the call sets, if any
 * @returns One target per locator, none when the call names no operation
 */
function locatorsNamed(
  args: UpdateLiveSetArgs,
  liveSet: LiveAPI,
  timeSignature: UpdateLiveSetCall["timeSignature"],
): Array<Target<LocatorPayload>> {
  if (args.locatorOperation == null) {
    return [];
  }

  const meter =
    timeSignature == null
      ? readMeter(liveSet)
      : {
          timeSigNumerator: timeSignature.numerator,
          timeSigDenominator: timeSignature.denominator,
        };

  return locatorPipelineTargets(
    liveSet,
    locatorTargets(
      args.locatorOperation,
      {
        locatorId: args.locatorId,
        locatorTime: args.locatorTime,
        locatorName: args.locatorName,
      },
      liveSet,
      meter,
    ),
    meter,
  );
}

/**
 * Write the tempo, time signature and scale, before any locator is touched.
 * @param checked - The checked call
 */
function writeSongState(checked: UpdateLiveSetChecked): void {
  const { liveSet, tempo, timeSignature, scale, parsedScale } = checked;
  const { result } = checked.run;

  result.id = liveSet.id;

  if (tempo != null) {
    applyTempo(liveSet, tempo, result);
  }

  if (timeSignature != null) {
    applyTimeSignature(liveSet, timeSignature, result);
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

  if (checked.operation != null) {
    // Read again: the meter Live holds now, after any timeSignature write.
    checked.meter = readMeter(liveSet);
  }
}

/**
 * Run the operation on one locator. Sequential, which the pipeline guarantees:
 * each operation moves the playhead, so they can't overlap.
 * @param target - The locator
 * @param step - The call's state for this target
 * @returns The locator's entry
 */
async function writeLocator(
  target: AppliedTarget<LocatorPayload>,
  step: Step<UpdateLiveSetChecked>,
): Promise<Record<string, unknown>> {
  const { liveSet, operation } = step.checked;
  const meter = step.checked.meter as SongMeter;
  const locator = target.data.target;

  switch (operation) {
    case "create":
      return await createLocator(
        liveSet,
        locator,
        meter,
        step.call.ctx,
        step.landed,
      );
    case "delete":
      return await deleteLocator(liveSet, locator, meter);
    default:
      return renameLocator(liveSet, locator, meter);
  }
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
