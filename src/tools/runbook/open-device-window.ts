// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RunbookStep } from "./helpers/build-m4l-load-steps.ts";
import { appendOpenDeviceWindowSteps } from "./helpers/build-open-device-window-steps.ts";

interface OpenDeviceWindowArgs {
  devicePath: string;
  editX?: number;
  editY?: number;
  abletonLocale?: "de" | "en" | "unknown";
}

interface FailMode {
  symptom: string;
  detect: string;
  recovery: string;
}

interface VerifyChecks {
  windowShouldAppear: true;
  devicePath: string;
  // No Live API exposes a plugin window's open state, so confirmation is
  // screenshot-only.
  visionOnly: true;
}

interface OpenDeviceWindowResult {
  steps: RunbookStep[];
  failModes: FailMode[];
  verify: VerifyChecks;
  meta: {
    tool: "ppal-open-device-window";
    version: "1.0.0";
    abletonLocale: "de" | "en" | "unknown";
    estimatedSeconds: number;
    notes: string[];
  };
}

const TOOL_VERSION = "1.0.0";

// Single click + window-open settle; rough estimate.
const ESTIMATED_SECONDS = 2;

/**
 * Build a deterministic computer-use runbook for opening a device's floating
 * plugin editor window (VST/AU/Max-for-Live) in Live's Device View. Pure
 * recipe - no Live API call. Compose with ppal-select(devicePath) FIRST so
 * Live scrolls the device into view; this recipe only emits the click gesture.
 * @param args - Open parameters.
 * @returns Step plan, fail modes, verify checks, and meta.
 */
export function openDeviceWindow(
  args: OpenDeviceWindowArgs,
): OpenDeviceWindowResult {
  const steps: RunbookStep[] = [];

  appendOpenDeviceWindowSteps(steps, {
    editX: args.editX,
    editY: args.editY,
  });

  // The default anchor's gesture is recon-verified (single click toggles the
  // plugin window) but its x is set-dependent (device order/scroll). Warn the
  // caller so the click target is not blindly trusted on differing layouts.
  const usingDefaultAnchor = args.editX == null && args.editY == null;
  const notes = usingDefaultAnchor
    ? [
        "Default anchor (DEVICE_VIEW_ANCHORS.showWindowButton) is set-dependent: its x assumes the first plugin slot of a Max-device-led chain. Inspect the first (selection) screenshot and pass explicit editX/editY when the Device-View layout differs.",
      ]
    : [];

  return {
    steps,
    failModes: buildFailModes(),
    verify: {
      windowShouldAppear: true,
      devicePath: args.devicePath,
      visionOnly: true,
    },
    meta: {
      tool: "ppal-open-device-window",
      version: TOOL_VERSION,
      abletonLocale: args.abletonLocale ?? "unknown",
      estimatedSeconds: ESTIMATED_SECONDS,
      notes,
    },
  };
}

/**
 * Static fail-mode catalogue for the open-plugin-window gesture.
 * @returns Array of fail-mode descriptors.
 */
function buildFailModes(): FailMode[] {
  return [
    {
      symptom: "native Live device has no floating window",
      detect:
        "device type (from read-device/read-live-set) is a built-in Live device, not a VST/AU/Max plugin",
      recovery:
        "no-op: native devices live inline in the Device View; do not run this recipe for them",
    },
    {
      symptom: "plugin window opened behind the Live window",
      detect: "final screenshot shows no new floating window over Live",
      recovery:
        "the editor may be behind Live or on another display; raise it via the app switcher / open_application, then re-screenshot",
    },
    {
      symptom:
        "target device not selected or not scrolled into the Device View",
      detect:
        "first screenshot shows a different device highlighted, or the device is off-screen in the chain",
      recovery: "run ppal-select on the devicePath first, then rerun",
    },
    {
      symptom:
        "click missed the show-window toggle (device folded or scrolled)",
      detect: "final screenshot shows no editor and no visual change",
      recovery:
        "unfold the device / scroll the chain so the toggle is visible, then supply explicit editX/editY from the selection screenshot",
    },
    {
      symptom: "set-dependent Device-View layout shifts the default anchor",
      detect: "click lands on the wrong device's title bar",
      recovery:
        "the default anchor is best-effort; read the selection screenshot and pass explicit editX/editY",
    },
  ];
}
