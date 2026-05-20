// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import {
  appendRecordArrangementSteps,
  type RunbookStep,
} from "./helpers/build-record-steps.ts";

interface RecordArrangementArgs {
  durationSeconds?: number;
  view?: "arrangement" | "session";
  homeBeforeRecord?: boolean;
  saveAfter?: "none" | "save" | "save-as";
  savePath?: string;
  abletonLocale?: "de" | "en" | "unknown";
}

interface FailMode {
  symptom: string;
  detect: string;
  recovery: string;
}

interface VerifyChecks {
  // True only when the recipe emitted an explicit stop step (durationSeconds
  // set). Without durationSeconds the transport keeps running and the caller
  // stops it themselves - the recipe can't promise a stopped transport.
  transportShouldBeStopped: boolean;
  setDirty: boolean;
}

interface RecordArrangementResult {
  steps: RunbookStep[];
  failModes: FailMode[];
  verify: VerifyChecks;
  meta: {
    tool: "ppal-record-arrangement";
    version: "1.0.0";
    abletonLocale: "de" | "en" | "unknown";
    estimatedSeconds: number;
    notes: string[];
  };
}

const TOOL_VERSION = "1.0.0";

/**
 * Build a deterministic computer-use runbook for Live's Arrangement-Record
 * workflow. Pure recipe - no Live API call. Pre-conditions (track arm,
 * insert-marker position) are the caller's responsibility via
 * ppal-update-track and ppal-playback respectively.
 * @param args - Recording parameters.
 * @returns Step plan, fail modes, verify checks, and meta.
 */
export function recordArrangement(
  args: RecordArrangementArgs,
): RecordArrangementResult {
  const notes: string[] = [];
  const steps: RunbookStep[] = [];

  // Treat empty string as missing so callers can't sneak a no-op dialog past
  // the warn path by passing "".
  if (
    args.saveAfter === "save-as" &&
    (args.savePath == null || args.savePath === "")
  ) {
    console.warn(
      "ppal-record-arrangement: saveAfter='save-as' requires savePath; emitting cmd+shift+s but caller must fill the dialog",
    );
    notes.push(
      "savePath missing: save-as dialog will open but recipe stops before path entry",
    );
  }

  // Empty-string savePath is normalised to undefined so downstream helpers
  // do not have to repeat the empty-vs-null guard.
  const normalisedSavePath =
    args.savePath != null && args.savePath !== "" ? args.savePath : undefined;

  appendRecordArrangementSteps(steps, {
    durationSeconds: args.durationSeconds,
    view: args.view,
    homeBeforeRecord: args.homeBeforeRecord,
    saveAfter: args.saveAfter,
    savePath: normalisedSavePath,
  });

  const baseSeconds = args.durationSeconds ?? 0;
  const saveMode = args.saveAfter ?? "none";
  // A save step is only emitted when the recipe also emits the stop step,
  // which happens only when durationSeconds is set. Without durationSeconds
  // the transport keeps running (manual-stop pathway) and saveAfter is
  // effectively ignored. Additionally, 'save-as' bails out without writing
  // when savePath is missing.
  const durationDriven = args.durationSeconds != null;
  const saveActuallyHappens =
    durationDriven &&
    (saveMode === "save" ||
      (saveMode === "save-as" && normalisedSavePath != null));
  const overheadSeconds = saveActuallyHappens ? 1.4 : durationDriven ? 1 : 0;
  // transport is only known-stopped when the recipe emitted the stop step.
  const transportShouldBeStopped = durationDriven;

  return {
    steps,
    failModes: buildFailModes(),
    verify: {
      transportShouldBeStopped,
      setDirty: !saveActuallyHappens,
    },
    meta: {
      tool: "ppal-record-arrangement",
      version: TOOL_VERSION,
      abletonLocale: args.abletonLocale ?? "unknown",
      estimatedSeconds: baseSeconds + overheadSeconds,
      notes,
    },
  };
}

/**
 * Static fail-mode catalogue.
 * @returns Array of fail-mode descriptors covering arm-state, pixel drift,
 *   save-dialog quirks, and respawn behaviour.
 */
function buildFailModes(): FailMode[] {
  return [
    {
      symptom: "recording runs but no new clips appear",
      detect: "arrangement view shows no new clips after stop",
      recovery:
        "no track armed - call ppal-update-track with arm=true on the target track before this runbook",
    },
    {
      symptom: "record button click missed (pixel drift)",
      detect: "screenshot after step 3 shows record lamp not red",
      recovery:
        "retry the record-button click; if persistent, Live UI scaling shifted - rerun with abletonLocale='unknown'",
    },
    {
      symptom: "first-time save opens save-as dialog instead",
      detect: "macOS save sheet appears when caller asked for plain save",
      recovery:
        "set has never been saved - fall back to saveAfter='save-as' with explicit savePath",
    },
    {
      symptom: "recording continues after stop",
      detect: "record lamp still red after spacebar",
      recovery:
        "second spacebar press, or click record button again to toggle off",
    },
    {
      symptom: "macOS localisation shifts the record button pixel",
      detect: "click coordinate hits the wrong glyph (visible mismatch)",
      recovery:
        "transport bar layout differs - set abletonLocale and let caller re-target via vision",
    },
    {
      symptom: "save-as requested without savePath",
      detect: "result.meta.notes contains a savePath-missing entry",
      recovery:
        "caller must supply savePath in args or switch to saveAfter='save'",
    },
    {
      symptom: "Live in the wrong view before Record click",
      detect:
        "view-verify screenshot before record-click shows session grid when caller asked for arrangement (or vice versa)",
      recovery:
        "the recipe does NOT auto-press Tab (Tab toggles unsafely). Caller dispatches Tab manually after the verify-screenshot, then re-invokes ppal-record-arrangement",
    },
    {
      symptom: "Producer-Pal watchdog respawns Live after save",
      detect: "Live process restarts, fresh empty set appears",
      recovery:
        "Playbook §6 - never kill Live; the saved .als on disk is unaffected",
    },
  ];
}
