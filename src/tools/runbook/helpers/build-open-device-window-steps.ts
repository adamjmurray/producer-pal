// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RunbookStep } from "./build-m4l-load-steps.ts";

/**
 * Device-View pixel anchors for opening a plugin's floating editor window.
 *
 * TODO(recon): Phase-0 computer-use recon against a real VST/AU plugin must
 * confirm this anchor AND that a single click on the device's
 * show/hide-plugin-window toggle opens the floating editor (vs. a title-bar
 * double-click). The Device-View layout is set-dependent (device order, fold
 * state, chain scroll), so callers should treat this as a best-effort default
 * and override via editX/editY after inspecting the selection screenshot.
 */
export const DEVICE_VIEW_ANCHORS = {
  showWindowButton: [1040, 645] as [number, number],
} as const;

interface OpenDeviceWindowStepOptions {
  editX?: number;
  editY?: number;
}

/**
 * Build the open-plugin-window runbook step list. Mutates `steps` in place.
 * Assumes the caller has already run ppal-select on the target devicePath so
 * Live shows/scrolls the device into the Device View. Emits a selection-verify
 * screenshot, the show-window click, a settle wait, and a final verify
 * screenshot. Never sends Tab (toggles view) or Escape.
 * @param steps - Step array being built.
 * @param opts - Click-target options.
 */
export function appendOpenDeviceWindowSteps(
  steps: RunbookStep[],
  opts: OpenDeviceWindowStepOptions,
): void {
  const { editX, editY } = opts;

  // Half-override is silently wrong-target: one explicit axis mixed with one
  // set-dependent default lands the click somewhere unintended.
  if ((editX == null) !== (editY == null)) {
    throw new Error("editX and editY must be supplied as a pair");
  }

  const target: [number, number] =
    editX != null && editY != null
      ? [editX, editY]
      : DEVICE_VIEW_ANCHORS.showWindowButton;

  steps.push({
    action: "screenshot",
    label:
      "anchor: caller must verify the target device is selected in the Device View",
  });
  steps.push({
    action: "left_click",
    coordinate: target,
    label: `click show-plugin-window button [${target[0]}, ${target[1]}]`,
  });
  steps.push({
    action: "wait",
    duration: 0.4,
    label: "settle: wait for the plugin editor window to appear",
  });
  steps.push({
    action: "screenshot",
    label: "anchor: plugin editor window should now be visible",
  });
}
