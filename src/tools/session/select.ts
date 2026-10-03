// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { assertDefined } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import {
  applyPluginEditorWindow,
  buildTrackPath,
  updateClipSlotSelection,
  updateDeviceSelection,
  updateSceneSelection,
  updateTrackSelection,
  type TrackCategory,
} from "./helpers/selection-updates.ts";
import {
  requireSelectTargets,
  type SelectTargetsResolved,
} from "./helpers/require-select-targets.ts";
import {
  isSameLiveApiId,
  resolveNamedIds,
  type SelectIdArgs,
} from "./helpers/select-id-resolution.ts";
import { resolvePath } from "./helpers/select-path-resolution.ts";
import {
  applyViewChanges,
  resolveEffectiveView,
} from "./helpers/select-view-changes.ts";
import {
  applyArrangementStart,
  resolveArrangementPosition,
} from "./helpers/select-arrangement-position.ts";
import {
  resolveRackTarget,
  selectRackTarget,
} from "./helpers/rack-selection.ts";
import { runWrite } from "#src/tools/shared/write-pipeline/write-pipeline.ts";
import {
  type AppliedTarget,
  type Step,
  type Target,
  type WriteSpec,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  addClipToResponse,
  addDeviceToResponse,
  addSceneToResponse,
  addTrackToResponse,
  readFullState,
  type ResolvedArgs,
} from "./helpers/select-responses.ts";

export interface SelectArgs extends SelectIdArgs {
  // External params (from schema)
  view?: "session" | "arrangement";
  trackType?: TrackCategory;
  trackIndex?: number;
  sceneIndex?: number;
  /** Clip slot "t0/s3", an arrangement spot "t0[5|1]", a device "t0/d1", a drum
   * pad "t0/d0/pC1", or a bare track "t0" */
  path?: string;
  /** Deprecated clip slot, trackIndex/sceneIndex */
  slot?: string;
  /** Deprecated device path */
  devicePath?: string;
  openPluginWindow?: boolean;

  // Internal-only param (used by other tools calling select() directly)
  detailView?: "clip" | "device" | "none";
}

export interface SelectResult {
  view?: string;
  selectedTrack?: {
    id: string;
    /** Where the track is: "t0", "rt1" for a return, "mt" for the main track */
    path?: string;
    /** Only a regular track has one — see trackTypeField */
    type?: string;
  };
  selectedScene?: { id: string; path: string };
  selectedClip?: {
    id: string;
    /** Where the clip is: "t0/s3" in the session, "t0[5|1]" or "t0/l0[5|1]" in
     * the arrangement. select's own path takes either form. */
    path?: string;
  };
  selectedDevice?: {
    id: string;
    path: string;
    pluginWindowOpen?: boolean;
    detail?: string;
  };
  selectedDrumPad?: { id: string; path: string };
  selectedChain?: { id: string; path: string };
}

/** What the call asked for, read once. */
interface SelectCall {
  args: SelectArgs;
  resolved: ResolvedArgs;
}

/** What the call found before anything changed. */
interface SelectChecked extends SelectCall {
  /** Absent when the call names nothing to select: it only reads the state */
  required?: SelectTargetsResolved;
  rackTarget?: LiveAPI;
}

/**
 * Reads or updates the view state and selection in Ableton Live.
 *
 * When called with no arguments, returns the current view state.
 * When called with arguments, updates the view/selection and returns
 * only the fields relevant to what was changed.
 *
 * @param args - The parameters
 * @param ctx - Context from main
 * @returns Selection result with relevant fields only
 */
export function select(
  args: SelectArgs = {},
  ctx: Partial<ToolContext> = {},
): SelectResult {
  // No hook awaits, and the one target's entry is the answer.
  return runWrite(SELECT_WRITE, args, ctx) as SelectResult;
}

const SELECT_WRITE: WriteSpec<
  SelectArgs,
  SelectCall,
  undefined,
  SelectChecked,
  SelectResult
> = {
  tool: "ppal-select",
  words: { rerun: "selection" },
  parse: parseSelect,
  // One selection per call. The name is never shown: a lone target's skip
  // throws its detail.
  targets: (): Array<Target<undefined>> => [
    { named: { param: "path", value: "selection" }, data: undefined },
  ],
  check: checkSelect,
  write: writeSelection,
};

// --- Helpers below main export ---

/**
 * Read the call and refuse a contradictory one.
 * @param args - The select args
 * @returns The call, with its params resolved
 */
function parseSelect(args: SelectArgs): SelectCall {
  const resolved = resolveArgs(args);

  validateParameters({
    trackId: resolved.trackId,
    category: resolved.category,
    trackIndex: resolved.trackIndex,
    sceneId: resolved.sceneId,
    sceneIndex: resolved.sceneIndex,
    deviceId: resolved.deviceId ?? resolved.rackTargetId,
    devicePath: resolved.devicePath ?? resolved.rackTargetPath,
    devicePathParam: resolved.devicePathParam ?? "path",
    slot: resolved.parsedClipSlot,
  });

  return { args, resolved };
}

/**
 * Look up what the call names, so a target that isn't there refuses the call
 * with Live untouched.
 * @param call - The call
 * @returns What it found
 */
function checkSelect(call: SelectCall): SelectChecked {
  const { resolved } = call;

  if (!resolved.hasArgs) {
    return call;
  }

  return {
    ...call,
    required: requireSelectTargets({
      trackId: resolved.trackId,
      category: resolved.category,
      trackIndex: resolved.trackIndex,
      sceneId: resolved.sceneId,
      sceneIndex: resolved.sceneIndex,
      clipSlot: resolved.parsedClipSlot,
      devicePath: resolved.devicePath,
    }),
    // Resolved before any view change, like requireSelectTargets, so a path
    // naming nothing leaves Live untouched.
    rackTarget: resolveRackTarget(
      resolved.rackTargetId,
      resolved.rackTargetPath,
    ),
  };
}

/**
 * Make the selection, and report what it produced.
 * @param _target - The one target (unused)
 * @param step - The call's state
 * @returns The selection, with only the fields the call changed
 */
function writeSelection(
  _target: AppliedTarget<undefined>,
  step: Step<SelectChecked>,
): SelectResult {
  const { args, resolved, required, rackTarget } = step.checked;

  if (required == null) {
    return readFullState();
  }

  const { view, detailView } = args;
  const { trackId, sceneId, clipId, deviceId, parsedClipSlot } = resolved;
  const { trackIndex, category, sceneIndex, devicePath } = resolved;
  const { arrangementStartBeats } = resolved;
  const devicePathParam = resolved.devicePathParam ?? "path";

  const appView = LiveAPI.from(livePath.view.app);
  const songView = LiveAPI.from(livePath.view.song);

  // Perform selections
  const trackResult = updateTrackSelection({
    songView,
    trackId,
    category,
    trackIndex,
  });
  const sceneResult = updateSceneSelection({
    songView,
    sceneId,
    sceneIndex,
  });

  if (arrangementStartBeats != null) {
    applyArrangementStart(arrangementStartBeats);

    // Said after the writes: a lane that isn't there stops nothing, so the
    // warning reports what the call did rather than what it refused.
    if (resolved.missingTakeLane != null) {
      console.warn(resolved.missingTakeLane);
    }
  }

  // Scene/slot are session-only concepts, so they force session view.
  const needsSessionView =
    sceneId != null || sceneIndex != null || parsedClipSlot != null;

  const effectiveView = resolveEffectiveView({
    appView,
    songView,
    view,
    needsSessionView,
    needsArrangementView: arrangementStartBeats != null,
    clipId,
  });

  const selectedDeviceAPI = updateDeviceSelection({
    songView,
    deviceId,
    devicePath,
    devicePathParam,
    resolvedDevice: required.device,
  });

  const pluginWindow =
    args.openPluginWindow == null
      ? null
      : {
          open: args.openPluginWindow,
          ...applyPluginEditorWindow(
            selectedDeviceAPI,
            args.openPluginWindow,
            step.call,
          ),
        };

  const rackSelection =
    rackTarget == null ? undefined : selectRackTarget(songView, rackTarget);

  const clipSlotHasClip =
    parsedClipSlot != null &&
    updateClipSlotSelection({ songView, clipSlot: parsedClipSlot });

  // Apply detail view and auto-close browser
  applyViewChanges({
    appView,
    detailView,
    clipId,
    deviceId,
    devicePath,
    hasRackTarget: rackTarget != null,
    clipSlotHasClip,
    viewOnly: resolved.viewOnly,
  });

  // Build response with only relevant fields
  const result: SelectResult = {};

  if (effectiveView != null) {
    result.view = effectiveView;
  }

  addTrackToResponse(result, trackResult.selectedTrackId);
  addSceneToResponse(result, sceneResult.selectedSceneId);
  addClipToResponse(result, resolved, clipSlotHasClip);
  addDeviceToResponse(result, resolved, selectedDeviceAPI);
  Object.assign(result, rackSelection);

  if (result.selectedDevice != null && pluginWindow != null) {
    if (pluginWindow.applied) {
      result.selectedDevice.pluginWindowOpen = pluginWindow.open;
    }

    if (pluginWindow.detail != null) {
      appendDetail(result.selectedDevice, pluginWindow.detail);
    }
  }

  return result;
}

interface ValidateParametersOptions {
  trackId?: string;
  category?: TrackCategory;
  trackIndex?: number;
  sceneId?: string;
  sceneIndex?: number;
  deviceId?: string;
  devicePath?: string;
  devicePathParam: "path" | "devicePath";
  slot?: { trackIndex: number; sceneIndex: number };
}

/**
 * Validate selection parameters for conflicts
 * @param options - Parameters object
 * @param options.trackId - Track ID
 * @param options.category - Track category
 * @param options.trackIndex - Track index
 * @param options.sceneId - Scene ID
 * @param options.sceneIndex - Scene index
 * @param options.deviceId - Device ID
 * @param options.devicePath - Device path
 * @param options.devicePathParam - The param the device path came from
 * @param options.slot - Clip slot coordinates
 */
function validateParameters({
  trackId,
  category,
  trackIndex,
  sceneId,
  sceneIndex,
  deviceId,
  devicePath,
  devicePathParam,
  slot: _slot,
}: ValidateParametersOptions): void {
  // Track selection validation
  if (category === "master" && trackIndex != null) {
    throw new Error(
      "trackIndex should not be provided when trackType is 'master'",
    );
  }

  // Device selection validation
  if (deviceId != null && devicePath != null) {
    throw new Error(`cannot specify both id and ${devicePathParam}`);
  }

  // Cross-validation for track ID vs index (requires Live API calls)
  if (trackId != null && trackIndex != null) {
    // An index with a category that builds no path is already refused above.
    const trackAPI = LiveAPI.from(
      assertDefined(buildTrackPath(category, trackIndex), "track path"),
    );

    if (trackAPI.exists() && !isSameLiveApiId(trackAPI.id, trackId)) {
      throw new Error("id and trackIndex refer to different tracks");
    }
  }

  // Cross-validation for scene ID vs index
  if (sceneId != null && sceneIndex != null) {
    const sceneAPI = LiveAPI.from(livePath.scene(sceneIndex));

    if (sceneAPI.exists() && !isSameLiveApiId(sceneAPI.id, sceneId)) {
      throw new Error("id and sceneIndex refer to different scenes");
    }
  }
}

/**
 * Resolve external params (id, path, slot string) to internal representations
 * @param args - Raw select arguments
 * @returns Resolved arguments with parsed clipSlot
 */
function resolveArgs(args: SelectArgs): ResolvedArgs {
  const { trackId, sceneId, clipId, deviceId, rackTargetId } =
    resolveNamedIds(args);

  const fromPath = resolvePath(args, { trackId, sceneId, clipId, deviceId });
  const { parsedClipSlot, devicePath, devicePathParam, rackTargetPath } =
    fromPath;
  const { trackIndex, category, sceneIndex } = fromPath;
  // Read before any write, like the existence checks: a position Live can't
  // resolve must fail with the view and selection untouched.
  const arrangement = resolveArrangementPosition(fromPath.arrangementPosition);

  const hasSelectionArgs =
    trackId != null ||
    trackIndex != null ||
    category != null ||
    sceneId != null ||
    sceneIndex != null ||
    clipId != null ||
    deviceId != null ||
    devicePath != null ||
    rackTargetId != null ||
    rackTargetPath != null ||
    args.openPluginWindow != null ||
    parsedClipSlot != null;

  const hasArgs = hasSelectionArgs || args.view != null;
  const viewOnly = args.view != null && !hasSelectionArgs;

  return {
    trackId,
    sceneId,
    // A clip on the spot a position path names is selected like any other.
    clipId: clipId ?? arrangement?.clipId,
    deviceId,
    trackIndex,
    category: category ?? "regular",
    sceneIndex,
    arrangementStartBeats: arrangement?.beats,
    missingTakeLane: arrangement?.missingTakeLane,
    parsedClipSlot,
    devicePath,
    devicePathParam,
    rackTargetId,
    rackTargetPath,
    hasArgs,
    viewOnly,
  };
}
