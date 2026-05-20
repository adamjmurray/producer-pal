// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  appendSaveDialog,
  type RunbookStep,
  splitDestPath,
} from "./build-render-steps.ts";

// Re-export so callers in slice 2 don't have to know which sibling helper
// owns the canonical type definition.
export { type RunbookStep };

/**
 * Live's transport-bar pixel anchors. Captured during the Welle-3 recon pass
 * on 2026-05-20 against a 1366x860 Live 12 backbuffer on macOS. The transport
 * bar layout does not shift between DE and EN, so these anchors are
 * locale-agnostic.
 */
export const TRANSPORT_BAR_ANCHORS = {
  // The record button sits between play (left) and stop (right) in the
  // transport bar. Clicking it arms arrangement-record-on-play.
  recordButton: [621, 63] as [number, number],
} as const;

interface RecordOptions {
  durationSeconds?: number;
  view?: "arrangement" | "session";
  homeBeforeRecord?: boolean;
  saveAfter?: "none" | "save" | "save-as";
  savePath?: string;
}

/**
 * Build the arrangement-record runbook step list. Mutates `steps` in place.
 * Pre-conditions (armed tracks, insert-marker position) are not the recipe's
 * responsibility - the caller provides them via ppal-update-track and
 * ppal-playback.
 * @param steps - Step array being built.
 * @param opts - Record options.
 */
export function appendRecordArrangementSteps(
  steps: RunbookStep[],
  opts: RecordOptions,
): void {
  // We do NOT auto-press Tab to "ensure arrangement view" — Tab toggles
  // Session<->Arrangement, so it would silently flip the view if Live were
  // already in Arrangement. Instead we emit a screenshot anchor so the caller
  // can verify the view via vision and dispatch Tab themselves if needed.
  if (opts.view != null) {
    steps.push({
      action: "screenshot",
      label: `anchor: caller must verify '${opts.view}' view before record`,
    });
  }

  if (opts.homeBeforeRecord) {
    steps.push({
      action: "key",
      text: "Home",
      label: "reset Insert Marker to 1.1.1",
    });
  }

  steps.push({
    action: "left_click",
    coordinate: TRANSPORT_BAR_ANCHORS.recordButton,
    label: "click Record button",
  });
  steps.push({
    action: "wait",
    duration: 0.15,
    label: "settle record start",
  });
  steps.push({
    action: "screenshot",
    label: "anchor: record started (lamp should be red)",
  });

  if (opts.durationSeconds != null) {
    steps.push({
      action: "wait",
      duration: opts.durationSeconds,
      label: `record for ${opts.durationSeconds}s`,
    });
  }

  steps.push({
    action: "key",
    text: "space",
    label: "stop transport",
  });
  steps.push({
    action: "wait",
    duration: 0.2,
    label: "settle stop",
  });

  appendSaveStep(steps, opts);

  steps.push({
    action: "screenshot",
    label: "anchor: final state after record + save",
  });
}

// Re-export splitDestPath under the slice-2 name `splitSavePath` for callers
// (tests) that import the savePath-flavored alias. The Slice-1 helper
// already throws on empty/trailing-slash input and returns the same shape.
export { splitDestPath as splitSavePath };

/**
 * Append the save step matching the saveAfter mode. Falls back to a warn-
 * note path when save-as is requested without savePath.
 * @param steps - Step array being built.
 * @param opts - Record options (only saveAfter/savePath consulted).
 */
function appendSaveStep(steps: RunbookStep[], opts: RecordOptions): void {
  const saveAfter = opts.saveAfter ?? "none";

  if (saveAfter === "save") {
    steps.push({
      action: "key",
      text: "cmd+s",
      label: "Save Set (cmd+s)",
    });
    steps.push({
      action: "wait",
      duration: 0.4,
      label: "settle save",
    });

    return;
  }

  if (saveAfter === "save-as") {
    steps.push({
      action: "key",
      text: "cmd+shift+s",
      label: "Save Set As (cmd+shift+s)",
    });

    if (opts.savePath != null) {
      appendSaveDialogPathInput(steps, opts.savePath);
    }
  }
}

/**
 * Append the macOS save-dialog "Go To Folder" + filename overwrite sequence.
 * Reuses Slice-1's `appendSaveDialog` and drops its leading "click
 * Exportieren" step (Record uses cmd+shift+s instead of an Export-button
 * click to open the dialog). The remaining steps are identical, so we share
 * the helper instead of duplicating ~50 lines.
 * @param steps - Step array being built.
 * @param savePath - Absolute or relative file path.
 */
function appendSaveDialogPathInput(
  steps: RunbookStep[],
  savePath: string,
): void {
  // Eager validation so the throw fires at this helper rather than inside
  // the shared appendSaveDialog (clearer stack for slice-2 callers).
  splitDestPath(savePath);

  const sliceSteps: RunbookStep[] = [];

  appendSaveDialog(sliceSteps, { destPath: savePath });
  // Drop the first step ("click Exportieren") - record uses cmd+shift+s.
  steps.push(...sliceSteps.slice(1));
}
