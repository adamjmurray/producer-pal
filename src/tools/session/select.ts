// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { LIVE_API_VIEW_NAMES } from "#src/tools/constants.ts";
import { toLiveApiView } from "#src/tools/shared/utils.ts";
import {
  applyDetailView,
  applyPluginEditorWindow,
  updateClipSelection,
  updateClipSlotSelection,
  updateDeviceSelection,
  updateSceneSelection,
  updateTrackSelection,
  validateParameters,
  type TrackCategory,
} from "./helpers/select-helpers.ts";
import { requireSelectTargets } from "./helpers/select-existence-helpers.ts";
import {
  determineAutoDetailView,
  resolveNamedIds,
  type SelectIdArgs,
} from "./helpers/select-id-helpers.ts";
import { resolvePath } from "./helpers/select-path-helpers.ts";
import {
  resolveRackTarget,
  selectRackTarget,
} from "./helpers/select-rack-helpers.ts";
import {
  buildClipResponseFromId,
  buildClipResponseFromSlot,
  buildDeviceResponseFromId,
  buildDeviceResponseFromPath,
  buildSceneResponseFromId,
  buildTrackResponseFromId,
  readFullState,
} from "./helpers/select-response-helpers.ts";

export interface SelectArgs extends SelectIdArgs {
  // External params (from schema)
  view?: "session" | "arrangement";
  trackType?: TrackCategory;
  trackIndex?: number;
  sceneIndex?: number;
  /** Clip slot "t0/s3", a device "t0/d1", a drum pad "t0/d0/pC1", or a bare track "t0" */
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
     * the arrangement. select's own path takes the session form only. */
    path?: string;
  };
  selectedDevice?: { id: string; path: string; pluginWindowOpen?: boolean };
  selectedDrumPad?: { id: string; path: string };
  selectedChain?: { id: string; path: string };
}

/**
 * Reads or updates the view state and selection in Ableton Live.
 *
 * When called with no arguments, returns the current view state.
 * When called with arguments, updates the view/selection and returns
 * only the fields relevant to what was changed.
 *
 * @param args - The parameters
 * @param _context - Context from main (unused)
 * @returns Selection result with relevant fields only
 */
export function select(
  args: SelectArgs = {},
  _context: Partial<ToolContext> = {},
): SelectResult {
  const resolved = resolveArgs(args);
  const { view, detailView } = args;
  const { trackId, sceneId, clipId, deviceId, parsedClipSlot } = resolved;
  const { trackIndex, category, sceneIndex, devicePath } = resolved;
  const { rackTargetId, rackTargetPath } = resolved;
  const devicePathParam = resolved.devicePathParam ?? "path";

  validateParameters({
    trackId,
    category,
    trackIndex,
    sceneId,
    sceneIndex,
    deviceId: deviceId ?? rackTargetId,
    devicePath: devicePath ?? rackTargetPath,
    devicePathParam,
    slot: parsedClipSlot,
  });

  if (!resolved.hasArgs) {
    return readFullState();
  }

  requireSelectTargets({
    trackId,
    category,
    trackIndex,
    sceneId,
    sceneIndex,
    clipSlot: parsedClipSlot,
    devicePath,
  });

  // Resolved before any view change, like requireSelectTargets, so a path
  // naming nothing leaves Live untouched.
  const rackTarget = resolveRackTarget(rackTargetId, rackTargetPath);

  const appView = LiveAPI.from(livePath.view.app);
  const songView = LiveAPI.from(livePath.view.song);

  // View switching
  let effectiveView: string | undefined;

  if (view != null) {
    appView.call("show_view", toLiveApiView(view));
    effectiveView = view;
  }

  // Auto-switch to session view for scene/slot (session-only concepts)
  const needsSessionView =
    sceneId != null || sceneIndex != null || parsedClipSlot != null;

  if (view == null && needsSessionView) {
    appView.call("show_view", toLiveApiView("session"));
    effectiveView = "session";
  }

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

  if (clipId !== undefined) {
    updateClipSelection({ appView, songView, clipId, requestedView: view });
  }

  const selectedDeviceAPI = updateDeviceSelection({
    songView,
    deviceId,
    devicePath,
    devicePathParam,
  });

  let pluginWindowOpen: boolean | undefined;

  if (args.openPluginWindow != null) {
    const applied = applyPluginEditorWindow(
      selectedDeviceAPI,
      args.openPluginWindow,
    );

    if (applied) pluginWindowOpen = args.openPluginWindow;
  }

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

  if (effectiveView != null) result.view = effectiveView;

  addTrackToResponse(result, trackResult.selectedTrackId);
  addSceneToResponse(result, sceneResult.selectedSceneId);
  addClipToResponse(result, resolved, clipSlotHasClip);
  addDeviceToResponse(result, resolved);
  Object.assign(result, rackSelection);

  if (pluginWindowOpen != null && result.selectedDevice != null) {
    result.selectedDevice.pluginWindowOpen = pluginWindowOpen;
  }

  return result;
}

interface ApplyViewChangesOptions {
  appView: LiveAPI;
  detailView?: "clip" | "device" | "none";
  clipId?: string;
  deviceId?: string;
  devicePath?: string;
  hasRackTarget: boolean;
  clipSlotHasClip: boolean;
  viewOnly: boolean;
}

/**
 * Apply detail view changes and auto-close browser on any selection
 * @param options - View change parameters
 * @param options.appView - LiveAPI instance for live_app view
 * @param options.detailView - Explicit detail view override (from internal callers)
 * @param options.clipId - Selected clip ID
 * @param options.deviceId - Selected device ID
 * @param options.devicePath - Selected device path
 * @param options.hasRackTarget - Whether a drum pad or rack chain was selected
 * @param options.clipSlotHasClip - Whether the selected clip slot contains a clip
 * @param options.viewOnly - Whether only the view param was provided
 */
function applyViewChanges({
  appView,
  detailView,
  clipId,
  deviceId,
  devicePath,
  hasRackTarget,
  clipSlotHasClip,
  viewOnly,
}: ApplyViewChangesOptions): void {
  const effectiveDetailView =
    detailView ??
    determineAutoDetailView({
      clipId,
      deviceId,
      devicePath,
      hasRackTarget,
      clipSlotHasClip,
      viewOnly,
    });

  if (effectiveDetailView != null) {
    applyDetailView({ appView, detailView: effectiveDetailView });
  }

  // Auto-hide browser when AI selects something — the browser panel overlaps
  // content the AI is trying to show. Users can reopen it manually.
  appView.call("hide_view", LIVE_API_VIEW_NAMES.BROWSER);
}

interface ResolvedArgs {
  trackId?: string;
  sceneId?: string;
  clipId?: string;
  deviceId?: string;
  trackIndex?: number;
  category: TrackCategory;
  sceneIndex?: number;
  parsedClipSlot?: { trackIndex: number; sceneIndex: number };
  devicePath?: string;
  devicePathParam?: "path" | "devicePath";
  rackTargetId?: string;
  rackTargetPath?: string;
  hasArgs: boolean;
  viewOnly: boolean;
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
    clipId,
    deviceId,
    trackIndex,
    category: category ?? "regular",
    sceneIndex,
    parsedClipSlot,
    devicePath,
    devicePathParam,
    rackTargetId,
    rackTargetPath,
    hasArgs,
    viewOnly,
  };
}

/**
 * Add track info to action response if a track was selected
 * @param result - Response being built
 * @param selectedTrackId - Live API ID of selected track, if any
 */
function addTrackToResponse(
  result: SelectResult,
  selectedTrackId: string | undefined,
): void {
  if (selectedTrackId != null) {
    const info = buildTrackResponseFromId(selectedTrackId);

    if (info) result.selectedTrack = info;
  }
}

/**
 * Add scene info to action response if a scene was selected
 * @param result - Response being built
 * @param selectedSceneId - Live API ID of selected scene, if any
 */
function addSceneToResponse(
  result: SelectResult,
  selectedSceneId: string | undefined,
): void {
  if (selectedSceneId != null) {
    const info = buildSceneResponseFromId(selectedSceneId);

    if (info) result.selectedScene = info;
  }
}

/**
 * Add clip info to action response if a clip was selected
 * @param result - Response being built
 * @param resolved - Resolved args
 * @param clipSlotHasClip - Whether clipSlot had a clip
 */
function addClipToResponse(
  result: SelectResult,
  resolved: ResolvedArgs,
  clipSlotHasClip: boolean,
): void {
  if (resolved.clipId != null) {
    const info = buildClipResponseFromId(resolved.clipId);

    if (info) {
      result.selectedClip = info;

      // A clip selection always switches Live to the clip's required view
      // (session for slotted clips, arrangement otherwise), so report that view
      // even when it overrides an explicitly requested, conflicting view.
      result.view =
        LiveAPI.from(resolved.clipId).clipSlotIndex == null
          ? "arrangement"
          : "session";
    }
  } else if (clipSlotHasClip && resolved.parsedClipSlot != null) {
    const info = buildClipResponseFromSlot(resolved.parsedClipSlot);

    if (info) result.selectedClip = info;
  }
}

/**
 * Add device info to action response if a device was selected
 * @param result - Response being built
 * @param resolved - Resolved args
 */
function addDeviceToResponse(
  result: SelectResult,
  resolved: ResolvedArgs,
): void {
  if (resolved.deviceId != null) {
    const info = buildDeviceResponseFromId(resolved.deviceId);

    if (info) result.selectedDevice = info;
  } else if (resolved.devicePath != null) {
    const info = buildDeviceResponseFromPath(resolved.devicePath);

    if (info) result.selectedDevice = info;
  }
}
