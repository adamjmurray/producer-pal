// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Atomic step in a computer-use runbook. Mirrors mcp__computer-use__* tool
 * names so the caller can dispatch them with no translation.
 */
export type RunbookStep =
  | { action: "key"; text: string; label: string }
  | { action: "wait"; duration: number; label: string }
  | { action: "left_click"; coordinate: [number, number]; label: string }
  | { action: "type"; text: string; label: string }
  | { action: "screenshot"; label: string };

/**
 * Pixel anchors for the Ableton Live 12 Export Audio/Video dialog, captured
 * via computer-use recon on 2026-05-20 against a 1366x860 screenshot. Anchors
 * are locale-agnostic - the dialog layout does not shift between DE and EN
 * because Live aligns by fixed positions, not text length.
 */
export const RENDER_DIALOG_ANCHORS = {
  renderedTrackDropdown: [745, 211] as [number, number],
  renderStartField: [766, 231] as [number, number],
  renderLengthField: [766, 251] as [number, number],
  toggleReturnsMaster: [776, 295] as [number, number],
  toggleAsLoop: [776, 315] as [number, number],
  toggleMono: [776, 335] as [number, number],
  toggleNormalize: [776, 355] as [number, number],
  toggleAnalysisFile: [776, 375] as [number, number],
  sampleRateDropdown: [763, 395] as [number, number],
  togglePcmEncoding: [776, 460] as [number, number],
  fileTypeDropdown: [763, 480] as [number, number],
  // The persistent file-type list opens below the dropdown header. Y-offsets
  // measured during recon: WAV row +15, AIFF row +29, FLAC row +43.
  fileTypeListItemWav: [741, 495] as [number, number],
  fileTypeListItemAiff: [741, 509] as [number, number],
  fileTypeListItemFlac: [741, 523] as [number, number],
  // bitDepth + dither dropdowns are intentionally NOT exposed via the
  // runbook (the per-row pixel anchors were never reconned). Set those
  // values manually in Live's Export dialog before invoking the tool. See
  // render-export.ts for the meta.notes documentation.
  toggleMp3Encoding: [776, 563] as [number, number],
  exportButton: [655, 683] as [number, number],
  cancelButton: [719, 683] as [number, number],
};

interface ToggleOptions {
  /** Toggle name for label tagging. */
  name: string;
  /** Pixel anchor of the toggle's value box. */
  anchor: [number, number];
  /** Desired value (true = "An", false = "Aus"). */
  desired: boolean;
  /** Default state in the dialog before any user change. */
  defaultState: boolean;
}

/**
 * Push a single toggle step only if desired state differs from the default.
 * @param steps - The step array being built (mutated).
 * @param opts - Toggle options.
 */
export function appendToggleIfDiffers(
  steps: RunbookStep[],
  opts: ToggleOptions,
): void {
  if (opts.desired === opts.defaultState) {
    return;
  }

  steps.push({
    action: "left_click",
    coordinate: opts.anchor,
    label: `toggle ${opts.name} -> ${opts.desired ? "An" : "Aus"}`,
  });
}

/**
 * Push the dialog-open prelude: hotkey + settle wait + anchor screenshot.
 * @param steps - The step array being built (mutated).
 */
export function appendDialogOpen(steps: RunbookStep[]): void {
  steps.push({
    action: "key",
    text: "cmd+shift+r",
    label: "open Export Audio/Video dialog",
  });
  steps.push({
    action: "wait",
    duration: 0.4,
    label: "settle dialog open",
  });
  steps.push({
    action: "screenshot",
    label: "anchor: dialog open recon",
  });
}

interface FileTypeOptions {
  format: "wav" | "aiff" | "flac" | "mp3";
}

/**
 * Push the file-type selection sequence. For mp3 we toggle the MP3 encoding
 * separately and switch PCM off; for wav/aiff/flac we click into the dropdown
 * then pick the matching row. The dropdown stays persistent (Live quirk) so
 * a row click is mandatory - escape/click-outside will not close it.
 * @param steps - The step array being built (mutated).
 * @param opts - File-type options.
 */
export function appendFileTypeSelection(
  steps: RunbookStep[],
  opts: FileTypeOptions,
): void {
  if (opts.format === "mp3") {
    // Default has PCM=An; we turn it off and turn MP3 on.
    steps.push({
      action: "left_click",
      coordinate: RENDER_DIALOG_ANCHORS.togglePcmEncoding,
      label: "toggle PCM-Encodierung -> Aus",
    });
    steps.push({
      action: "left_click",
      coordinate: RENDER_DIALOG_ANCHORS.toggleMp3Encoding,
      label: "toggle MP3-Encodierung -> An",
    });

    return;
  }

  // AIFF is the dialog's default file-type. We still click in to pick the row
  // explicitly so the produced recipe is reproducible from any prior state.
  steps.push({
    action: "left_click",
    coordinate: RENDER_DIALOG_ANCHORS.fileTypeDropdown,
    label: "open Datei-Typ dropdown",
  });
  const rowAnchor =
    opts.format === "wav"
      ? RENDER_DIALOG_ANCHORS.fileTypeListItemWav
      : opts.format === "aiff"
        ? RENDER_DIALOG_ANCHORS.fileTypeListItemAiff
        : RENDER_DIALOG_ANCHORS.fileTypeListItemFlac;

  steps.push({
    action: "left_click",
    coordinate: rowAnchor,
    label: `pick Datei-Typ ${opts.format.toUpperCase()}`,
  });
}

interface RenderRangeOptions {
  renderStart?: string;
  renderLength?: string;
}

/**
 * Push optional render-range field edits. Uses triple-click on the value to
 * select it before typing, matching Live's bar.beat.16th text-field behavior.
 * @param steps - The step array being built (mutated).
 * @param opts - Render-range options.
 */
export function appendRenderRange(
  steps: RunbookStep[],
  opts: RenderRangeOptions,
): void {
  if (opts.renderStart != null) {
    steps.push({
      action: "left_click",
      coordinate: RENDER_DIALOG_ANCHORS.renderStartField,
      label: "focus Rendering-Start",
    });
    steps.push({
      action: "key",
      text: "cmd+a",
      label: "select Rendering-Start value",
    });
    steps.push({
      action: "type",
      text: opts.renderStart,
      label: `type Rendering-Start ${opts.renderStart}`,
    });
    steps.push({
      action: "key",
      text: "Tab",
      label: "commit Rendering-Start",
    });
  }

  if (opts.renderLength != null) {
    steps.push({
      action: "left_click",
      coordinate: RENDER_DIALOG_ANCHORS.renderLengthField,
      label: "focus Rendering-Laenge",
    });
    steps.push({
      action: "key",
      text: "cmd+a",
      label: "select Rendering-Laenge value",
    });
    steps.push({
      action: "type",
      text: opts.renderLength,
      label: `type Rendering-Laenge ${opts.renderLength}`,
    });
    steps.push({
      action: "key",
      text: "Tab",
      label: "commit Rendering-Laenge",
    });
  }
}

interface SaveDialogOptions {
  destPath: string;
}

/**
 * Push the post-Export Save-As steps. Uses Cmd+Shift+G to set the parent
 * directory, then Cmd+A + type to overwrite the filename field. Last Return
 * triggers the actual render.
 * @param steps - The step array being built (mutated).
 * @param opts - Save-dialog options.
 */
export function appendSaveDialog(
  steps: RunbookStep[],
  opts: SaveDialogOptions,
): void {
  const { dir, name } = splitDestPath(opts.destPath);

  steps.push({
    action: "left_click",
    coordinate: RENDER_DIALOG_ANCHORS.exportButton,
    label: "click Exportieren",
  });
  steps.push({
    action: "wait",
    duration: 0.5,
    label: "wait for macOS save dialog",
  });
  steps.push({
    action: "key",
    text: "cmd+shift+g",
    label: "open Gehe zu Ordner",
  });
  steps.push({
    action: "wait",
    duration: 0.2,
    label: "wait for goto-folder sheet",
  });
  steps.push({
    action: "type",
    text: dir,
    label: `type parent directory ${dir}`,
  });
  steps.push({
    action: "key",
    text: "Return",
    label: "commit parent directory",
  });
  steps.push({
    action: "wait",
    duration: 0.3,
    label: "wait for save dialog focus return",
  });
  steps.push({
    action: "key",
    text: "cmd+a",
    label: "select existing filename",
  });
  steps.push({
    action: "type",
    text: name,
    label: `type filename ${name}`,
  });
  steps.push({
    action: "key",
    text: "Return",
    // Label kept neutral so the Slice-2 save-as path (record-arrangement
    // reuses appendSaveDialog) doesn't mislead callers - the Return here
    // confirms the macOS save dialog regardless of whether a render or a
    // set save is the surrounding workflow.
    label: "confirm save dialog",
  });
}

/**
 * Split an absolute or relative destination path into parent dir + filename.
 * No filesystem access - pure string utility.
 * @param destPath - Full path.
 * @returns Object with dir and name.
 */
export function splitDestPath(destPath: string): { dir: string; name: string } {
  if (destPath.length === 0 || destPath.endsWith("/")) {
    throw new Error(
      `splitDestPath: destPath must include a filename (got: '${destPath}')`,
    );
  }

  const lastSlash = destPath.lastIndexOf("/");

  if (lastSlash < 0) {
    return { dir: ".", name: destPath };
  }

  const dir = destPath.slice(0, lastSlash);
  const name = destPath.slice(lastSlash + 1);

  return { dir: dir.length === 0 ? "/" : dir, name };
}
