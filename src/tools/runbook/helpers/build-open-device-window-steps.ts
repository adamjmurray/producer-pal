// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RunbookStep } from "./build-m4l-load-steps.ts";

/**
 * Device-View pixel anchors for opening a plugin's floating editor window.
 *
 * Recon (2026-05-22, ValhallaVintageVerb AU in Live 12.4): a SINGLE left_click
 * on the device title-bar's wrench/plug toggle opens the floating editor (and a
 * second click closes it - it is a toggle, not a double-click). The y here
 * (~633) is the Device-View title-bar row and is reliable; the x is
 * set-dependent (device order, fold state, chain scroll) - this value is the
 * first plugin slot in a Max-device-led chain. Callers should still treat the
 * default as best-effort and override via editX/editY after inspecting the
 * selection screenshot whenever the layout differs.
 */
export const DEVICE_VIEW_ANCHORS = {
  showWindowButton: [387, 633] as [number, number],
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
