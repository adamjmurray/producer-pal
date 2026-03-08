// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { LIVE_API_VIEW_NAMES } from "#src/tools/constants.ts";
import { toLiveApiView } from "#src/tools/shared/utils.ts";
import {
  type TrackCategory,
  applyDetailView,
  updateClipSelection,
  updateClipSlotSelection,
  updateDeviceSelection,
  updateSceneSelection,
  updateTrackSelection,
  validateParameters,
} from "./select-helpers.ts";
import {
  determineAutoDetailView,
  parseClipSlot,
  resolveIdParam,
} from "./select-id-helpers.ts";
import {
  buildClipResponseFromId,
  buildClipResponseFromSlot,
  buildDeviceResponseFromId,
  buildDeviceResponseFromPath,
  buildSceneResponseFromId,
  buildTrackResponseFromId,
  readFullState,
} from "./select-response-helpers.ts";

interface SelectArgs {
  // External params (from schema)
  id?: string;
  view?: "session" | "arrangement";
  trackType?: "return" | "master";
  trackIndex?: number;
  sceneIndex?: number;
  slot?: string;
  devicePath?: string;

  // Internal-only params (used by other tools calling select() directly)
  trackId?: string;
  sceneId?: string;
  clipId?: string;
  deviceId?: string;
  detailView?: "clip" | "device" | "none";
}

export interface SelectResult {
  view?: string;
  selectedTrack?: { id: string; type: string; trackIndex?: number };
  selectedScene?: { id: string; sceneIndex: number };
  selectedClip?: {
    id: string;
    slot?: string;
    trackIndex?: number;
    arrangementStart?: string;
  };
  selectedDevice?: { id: string; path: string };
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
  const { view, trackType, trackIndex, devicePath, detailView } = args;
  const category = (trackType ?? "regular") as TrackCategory;
  const { trackId, sceneId, clipId, deviceId, parsedClipSlot } = resolved;

  validateParameters({
    trackId,
    category,
    trackIndex,
    sceneId,
    sceneIndex: args.sceneIndex,
    deviceId,
    devicePath,
    slot: parsedClipSlot,
  });

  if (!resolved.hasArgs) {
    return readFullState();
  }

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
    sceneId != null || args.sceneIndex != null || parsedClipSlot != null;

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
    sceneIndex: args.sceneIndex,
  });

  if (clipId !== undefined) {
    updateClipSelection({ appView, songView, clipId, requestedView: view });
  }

  updateDeviceSelection({ songView, deviceId, devicePath });

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
    clipSlotHasClip,
    viewOnly: resolved.viewOnly,
  });

  // Build response with only relevant fields
  const result: SelectResult = {};

  if (effectiveView != null) result.view = effectiveView;

  addTrackToResponse(result, trackResult.selectedTrackId);
  addSceneToResponse(result, sceneResult.selectedSceneId);
  addClipToResponse(result, resolved, clipSlotHasClip, effectiveView);
  addDeviceToResponse(result, resolved, args);

  return result;
}

interface ApplyViewChangesOptions {
  appView: LiveAPI;
  detailView?: "clip" | "device" | "none";
  clipId?: string;
  deviceId?: string;
  devicePath?: string;
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
 * @param options.clipSlotHasClip - Whether the selected clip slot contains a clip
 * @param options.viewOnly - Whether only the view param was provided
 */
function applyViewChanges({
  appView,
  detailView,
  clipId,
  deviceId,
  devicePath,
  clipSlotHasClip,
  viewOnly,
}: ApplyViewChangesOptions): void {
  const effectiveDetailView =
    detailView ??
    determineAutoDetailView({
      clipId,
      deviceId,
      devicePath,
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
  parsedClipSlot?: { trackIndex: number; sceneIndex: number };
  hasArgs: boolean;
  viewOnly: boolean;
}

/**
 * Resolve external params (id, clipSlot string) to internal representations
 * @param args - Raw select arguments
 * @returns Resolved arguments with parsed clipSlot
 */
function resolveArgs(args: SelectArgs): ResolvedArgs {
  let { trackId, sceneId, clipId, deviceId } = args;

  if (args.id != null) {
    const resolved = resolveIdParam(args.id);

    trackId = resolved.trackId ?? trackId;
    sceneId = resolved.sceneId ?? sceneId;
    clipId = resolved.clipId ?? clipId;
    deviceId = resolved.deviceId ?? deviceId;
  }

  const parsedClipSlot =
    typeof args.slot === "string" ? parseClipSlot(args.slot) : undefined;

  const hasSelectionArgs =
    trackId != null ||
    args.trackIndex != null ||
    args.trackType != null ||
    sceneId != null ||
    args.sceneIndex != null ||
    clipId != null ||
    deviceId != null ||
    args.devicePath != null ||
    parsedClipSlot != null;

  const hasArgs = hasSelectionArgs || args.view != null;
  const viewOnly = args.view != null && !hasSelectionArgs;

  return {
    trackId,
    sceneId,
    clipId,
    deviceId,
    parsedClipSlot,
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
 * @param effectiveView - View that was set (explicit or auto-switched)
 */
function addClipToResponse(
  result: SelectResult,
  resolved: ResolvedArgs,
  clipSlotHasClip: boolean,
  effectiveView: string | undefined,
): void {
  if (resolved.clipId != null) {
    const info = buildClipResponseFromId(resolved.clipId);

    if (info) {
      result.selectedClip = info;

      if (effectiveView == null) {
        result.view = info.slot != null ? "session" : "arrangement";
      }
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
 * @param args - Original args
 */
function addDeviceToResponse(
  result: SelectResult,
  resolved: ResolvedArgs,
  args: SelectArgs,
): void {
  if (resolved.deviceId != null) {
    const info = buildDeviceResponseFromId(resolved.deviceId);

    if (info) result.selectedDevice = info;
  } else if (args.devicePath != null) {
    const info = buildDeviceResponseFromPath(args.devicePath);

    if (info) result.selectedDevice = info;
  }
}
