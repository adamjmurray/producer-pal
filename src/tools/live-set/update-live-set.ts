import { barBeatToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import { intervalsToPitchClasses } from "#src/shared/pitch.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  findLocator,
  getLocatorId,
} from "#src/tools/shared/locator/locator-helpers.ts";
import { parseTimeSignature } from "#src/tools/shared/utils.ts";
import {
  applyScale,
  applyTempo,
  cleanupTempClip,
  extendSongIfNeeded,
} from "./helpers/update-live-set-helpers.ts";
import {
  deleteLocator,
  renameLocator,
  stopPlaybackIfNeeded,
  waitForPlayheadPosition,
} from "./helpers/update-live-set-locator-helpers.ts";

interface UpdateLiveSetArgs {
  tempo?: number;
  timeSignature?: string;
  scale?: string;
  locatorOperation?: string;
  locatorId?: string;
  locatorTime?: string;
  locatorName?: string;
  arrangementFollower?: boolean;
}

interface LocatorOperationOptions {
  locatorOperation: string;
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
 * @param args.locatorId - Locator ID for delete/rename
 * @param args.locatorTime - Bar|beat position for create/delete/rename
 * @param args.locatorName - Name for create/rename, or name filter for delete
 * @param args.arrangementFollower - Whether tracks follow arrangement timeline
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
    arrangementFollower,
  }: UpdateLiveSetArgs = {},
  context: UpdateLiveSetContext = {},
): Promise<Record<string, unknown>> {
  const liveSet = LiveAPI.from("live_set");

  // optimistic result object that only include properties that are actually set
  const result: Record<string, unknown> = {
    id: liveSet.id,
  };

  if (tempo != null) {
    applyTempo(liveSet, tempo, result);
  }

  if (timeSignature != null) {
    const parsed = parseTimeSignature(timeSignature);

    liveSet.set("signature_numerator", parsed.numerator);
    liveSet.set("signature_denominator", parsed.denominator);
    result.timeSignature = `${parsed.numerator}/${parsed.denominator}`;
  }

  if (scale != null) {
    applyScale(liveSet, scale, result);

    result.$meta ??= [];

    (result.$meta as string[]).push(
      "Scale applied to selected clips and defaults for new clips.",
    );
  }

  if (arrangementFollower != null) {
    liveSet.set("back_to_arranger", arrangementFollower ? 0 : 1);

    result.arrangementFollower = arrangementFollower;
  }

  // Include scalePitches when scale is set to a non-empty value
  const shouldIncludeScalePitches = scale != null && scale !== "";

  if (shouldIncludeScalePitches) {
    const rootNote = liveSet.getProperty("root_note") as number;
    const scaleIntervals = liveSet.getProperty("scale_intervals") as number[];

    result.scalePitches = intervalsToPitchClasses(scaleIntervals, rootNote);
  }

  // Handle locator operations
  if (locatorOperation != null) {
    const locatorResult = await handleLocatorOperation(
      liveSet,
      {
        locatorOperation,
        locatorId,
        locatorTime,
        locatorName,
      },
      context,
    );

    result.locator = locatorResult;
  }

  return result;
}

/**
 * Handle locator operations (create, delete, rename)
 * @param liveSet - The live_set LiveAPI object
 * @param options - Operation options
 * @param options.locatorOperation - "create", "delete", or "rename"
 * @param options.locatorId - Locator ID for delete/rename
 * @param options.locatorTime - Bar|beat position
 * @param options.locatorName - Name for create/rename or name filter for delete
 * @param context - Context object with silenceWavPath
 * @returns Result of the locator operation
 */
async function handleLocatorOperation(
  liveSet: LiveAPI,
  {
    locatorOperation,
    locatorId,
    locatorTime,
    locatorName,
  }: LocatorOperationOptions,
  context: UpdateLiveSetContext,
): Promise<Record<string, unknown>> {
  const timeSigNumerator = liveSet.getProperty("signature_numerator") as number;
  const timeSigDenominator = liveSet.getProperty(
    "signature_denominator",
  ) as number;

  switch (locatorOperation) {
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
      throw new Error(`Unknown locator operation: ${locatorOperation}`);
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
    console.error("Warning: locatorTime is required for create operation");

    return {
      operation: "skipped",
      reason: "missing_locatorTime",
    };
  }

  const targetBeats = barBeatToAbletonBeats(
    locatorTime,
    timeSigNumerator,
    timeSigDenominator,
  );

  // Check if a locator already exists at this position
  const existing = findLocator(liveSet, { timeInBeats: targetBeats });

  if (existing) {
    console.error(
      `Locator already exists at ${locatorTime} (id: ${getLocatorId(existing.index)}), skipping create`,
    );

    return {
      operation: "skipped",
      reason: "locator_exists",
      time: locatorTime,
      existingId: getLocatorId(existing.index),
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
    time: locatorTime,
    ...(locatorName != null && { name: locatorName }),
    ...(found && { id: getLocatorId(found.index) }),
  };
}
