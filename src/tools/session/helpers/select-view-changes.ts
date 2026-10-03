// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { LIVE_API_VIEW_NAMES } from "#src/tools/constants.ts";
import { toLiveApiView } from "#src/tools/shared/helpers/live-api-values.ts";
import { determineAutoDetailView } from "./select-id-resolution.ts";
import { applyDetailView, updateClipSelection } from "./selection-updates.ts";

interface ResolveEffectiveViewOptions {
  appView: LiveAPI;
  songView: LiveAPI;
  view?: "session" | "arrangement";
  needsSessionView: boolean;
  needsArrangementView: boolean;
  clipId?: string;
}

/**
 * Decide the view select ends on and switch Live to it. An explicit `view`
 * always wins; otherwise a scene/slot target forces session view, a song
 * position forces arrangement view, and a clip target infers session or
 * arrangement from where the clip lives.
 * @param options - Inputs to the decision
 * @param options.appView - LiveAPI instance for live_app view
 * @param options.songView - LiveAPI instance for live_set view
 * @param options.view - The caller's own `view` param, if given
 * @param options.needsSessionView - Whether a scene/slot target forces session
 * @param options.needsArrangementView - Whether a song position forces arrangement
 * @param options.clipId - Clip ID being selected, if any
 * @returns The view select switched to and should report, if any
 */
export function resolveEffectiveView({
  appView,
  songView,
  view,
  needsSessionView,
  needsArrangementView,
  clipId,
}: ResolveEffectiveViewOptions): "session" | "arrangement" | undefined {
  const forcedView = needsSessionView
    ? "session"
    : needsArrangementView
      ? "arrangement"
      : undefined;

  if (view != null) {
    appView.call("show_view", toLiveApiView(view));
  } else if (forcedView != null) {
    appView.call("show_view", toLiveApiView(forcedView));
  }

  let effectiveView = view ?? forcedView;

  if (clipId !== undefined) {
    const clipView = updateClipSelection({
      appView,
      songView,
      clipId,
      switchView: view == null,
    });

    effectiveView = view == null ? clipView : effectiveView;
  }

  return effectiveView;
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
export function applyViewChanges({
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
