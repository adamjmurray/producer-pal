// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  appendLoadM4lDeviceSteps,
  type RunbookStep,
} from "./helpers/build-m4l-load-steps.ts";

interface LoadM4lDeviceArgs {
  deviceName: string;
  category: "max-audio-effect" | "max-instrument" | "max-midi-effect" | "user";
  dropX?: number;
  dropY?: number;
  useArrangementView?: boolean;
  abletonLocale?: "de" | "en" | "unknown";
}

interface FailMode {
  symptom: string;
  detect: string;
  recovery: string;
}

interface VerifyChecks {
  deviceShouldExist: true;
  expectedDeviceName: string;
  // Echoed so the caller can cross-check the loaded device type against the
  // category they asked for. The three Max-for-Live sub-categories share a
  // pixel anchor (browser disambiguates by name search), so a name collision
  // could load the wrong kind; this field lets the post-load
  // ppal-read-device call verify the device type matches.
  expectedCategory:
    | "max-audio-effect"
    | "max-instrument"
    | "max-midi-effect"
    | "user";
}

interface LoadM4lDeviceResult {
  steps: RunbookStep[];
  failModes: FailMode[];
  verify: VerifyChecks;
  meta: {
    tool: "ppal-load-m4l-device";
    version: "1.0.0";
    abletonLocale: "de" | "en" | "unknown";
    estimatedSeconds: number;
    notes: string[];
  };
}

const TOOL_VERSION = "1.0.0";

// Drag-drop + browser navigation + instantiate settle; rough estimate.
const ESTIMATED_SECONDS = 3;

/**
 * Build a deterministic computer-use runbook for loading a Max-for-Live
 * device from Live's browser via drag-and-drop. Pure recipe - no Live API
 * call. Post-load, the caller should use ppal-read-track with
 * include=['devices'] to confirm the device exists and ppal-update-device
 * for any macro/parameter tweaks.
 * @param args - Load parameters.
 * @returns Step plan, fail modes, verify checks, and meta.
 */
export function loadM4lDevice(args: LoadM4lDeviceArgs): LoadM4lDeviceResult {
  const steps: RunbookStep[] = [];

  appendLoadM4lDeviceSteps(steps, {
    deviceName: args.deviceName,
    category: args.category,
    dropX: args.dropX,
    dropY: args.dropY,
    useArrangementView: args.useArrangementView,
  });

  return {
    steps,
    failModes: buildFailModes(),
    verify: {
      deviceShouldExist: true,
      expectedDeviceName: args.deviceName,
      expectedCategory: args.category,
    },
    meta: {
      tool: "ppal-load-m4l-device",
      version: TOOL_VERSION,
      abletonLocale: args.abletonLocale ?? "unknown",
      estimatedSeconds: ESTIMATED_SECONDS,
      notes: [],
    },
  };
}

/**
 * Static fail-mode catalogue covering browser-state, drag-drop, and post-
 * load surprises (compile modals, wrong-track drops).
 * @returns Array of fail-mode descriptors.
 */
function buildFailModes(): FailMode[] {
  return [
    {
      symptom: "browser pane closed",
      detect: "screenshot before category click shows main area, not browser",
      recovery: "press cmd+alt+b to toggle browser, then rerun",
    },
    {
      symptom: "category click misses (category scrolled out of view)",
      detect: "screenshot after step 2 shows wrong category contents",
      recovery:
        "scroll the browser category list to top before this runbook; or recapture maxForLiveCategory anchor for the current scroll state",
    },
    {
      symptom: "drag releases on empty timeline instead of track",
      detect: "screenshot after drop shows no new device on any track",
      recovery:
        "supply explicit dropX/dropY targeting the track header you want",
    },
    {
      symptom: ".amxd not found in user library",
      detect: "search result is empty after step 6",
      recovery:
        "category mismatch - retry with category='user' (or built-in category)",
    },
    {
      symptom: "Live shows .amxd compilation modal after drop",
      detect: "modal sheet titled 'Editing Max Device' or similar",
      recovery:
        "do NOT auto-dismiss - surface to user, .amxd compilation can fail",
    },
    {
      symptom: "device loads on wrong track",
      detect:
        "ppal-read-track on target reveals no new device; another track has it",
      recovery:
        "drop target was aligned to a different lane - supply corrected dropX/dropY",
    },
    {
      symptom: "macOS locale shifts browser pane width",
      detect: "category anchor click hits a different label",
      recovery: "set abletonLocale='unknown' and re-target via vision",
    },
    {
      symptom: "drag pickup never registers (Live treats it as click)",
      detect: "no ghost device follows the cursor after step 7",
      recovery:
        "Playbook §2 timing violated - check the 0.55s wait between mouse-down and the first move",
    },
    {
      symptom: "wrong device type matched (name collision across categories)",
      detect:
        "post-load device exists but is e.g. an Audio Effect when caller asked for an Instrument",
      recovery:
        "the three Max-for-Live sub-categories share the same browser anchor and rely on name uniqueness; rename one device or load it from User Library category instead",
    },
  ];
}
