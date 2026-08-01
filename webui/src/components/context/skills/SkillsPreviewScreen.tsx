// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type Notation,
  NOTATION_LABELS,
  NOTATIONS,
} from "#src/shared/notation";
import { CharTokenCount } from "#webui/components/context/collection/CharTokenCount";
import { CopyButton } from "#webui/components/context/collection/CopyButton";
import { DOUBLE_PANE_WIDTH } from "#webui/components/context/ContextScreen";
import { CHIP_BUTTON_CLASS } from "#webui/components/context/editor/context-buttons";
import { ContextHeader } from "#webui/components/context/editor/ContextHeader";
import { MarkdownEditor } from "#webui/components/context/MarkdownEditor";
import { noop } from "#webui/components/mode-context";
import {
  type SkillsCombination,
  type SkillsPreviewStatus,
  useSkillsPreview,
} from "#webui/hooks/context/use-skills-preview";

const CLOSE_ARIA_LABEL = "Close context editor";

const SELECT_CLASS =
  "text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-zinc-900 dark:text-zinc-100";

interface SkillsPreviewScreenProps {
  /** The Project | Global | Instructions | Skills tab strip. */
  tabSlot: preact.JSX.Element;
  /** The Preview/Source view toggle for the Skills tab. */
  viewSlot: preact.JSX.Element;
  /** Close the overlay (omitted on the standalone /context page). */
  onClose?: () => void;
}

/**
 * The Skills "Preview" view: pick a notation + small-model combination and see
 * the exact assembled "# Producer Pal Skills" blob ppal-connect would return for
 * it (with the user's fragment overrides applied), plus its size. Defaults to —
 * and badges — the device's current live combination. Read-only, so the header
 * shows a "Read-only preview" note instead of a save indicator.
 * @param props - Screen props
 * @returns Screen element
 */
export function SkillsPreviewScreen(
  props: SkillsPreviewScreenProps,
): preact.JSX.Element {
  const { tabSlot, viewSlot, onClose } = props;
  const preview = useSkillsPreview();

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">
      <ContextHeader
        title="Skills"
        tabSlot={tabSlot}
        closeAriaLabel={CLOSE_ARIA_LABEL}
        rightSlot={
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Read-only preview
          </span>
        }
        onClose={onClose}
      />
      <PreviewControls
        selected={preview.selected}
        currentMode={preview.currentMode}
        status={preview.status}
        onNotation={preview.setNotation}
        onSmallModel={preview.setSmallModelMode}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <PreviewBody status={preview.status} viewSlot={viewSlot} />
      </div>
    </div>
  );
}

// --- Helpers below main export ---

interface PreviewControlsProps {
  selected: SkillsCombination;
  currentMode: SkillsCombination | null;
  status: SkillsPreviewStatus;
  onNotation: (notation: Notation) => void;
  onSmallModel: (smallModelMode: boolean) => void;
}

/**
 * Controls strip: the notation + model-size pickers, and (right aligned) the
 * live-combination badge and the assembled blob's size. The Preview/Source view
 * toggle sits centered in the body header below (see PreviewFrame), matching the
 * editor's toggle position so switching views never moves it.
 * @param props - Controls props
 * @returns Controls element
 */
function PreviewControls(props: PreviewControlsProps): preact.JSX.Element {
  const { selected, currentMode, status, onNotation, onSmallModel } = props;

  return (
    <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-700">
      <div
        className={`mx-auto w-full ${DOUBLE_PANE_WIDTH} flex flex-wrap items-center gap-x-3 gap-y-2`}
      >
        <NotationSelect value={selected.notation} onSelect={onNotation} />
        <ModelSelect value={selected.smallModelMode} onSelect={onSmallModel} />
        <div className="ml-auto flex items-center gap-3">
          {isLive(selected, currentMode) && <LiveBadge />}
          <PreviewSize status={status} />
        </div>
      </div>
    </div>
  );
}

interface NotationSelectProps {
  value: Notation;
  onSelect: (notation: Notation) => void;
}

/**
 * Notation picker for the preview (does not change the device's live notation).
 * @param props - Select props
 * @returns Select element
 */
function NotationSelect(props: NotationSelectProps): preact.JSX.Element {
  const { value, onSelect } = props;

  return (
    <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
      Notation
      <select
        aria-label="Preview notation"
        value={value}
        onChange={(event) =>
          onSelect((event.target as HTMLSelectElement).value as Notation)
        }
        className={SELECT_CLASS}
      >
        {NOTATIONS.map((notation) => (
          <option key={notation} value={notation}>
            {NOTATION_LABELS[notation]}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ModelSelectProps {
  value: boolean;
  onSelect: (smallModelMode: boolean) => void;
}

/**
 * Model-size picker (Standard vs. small-model), which selects the basic skills.
 * @param props - Select props
 * @returns Select element
 */
function ModelSelect(props: ModelSelectProps): preact.JSX.Element {
  const { value, onSelect } = props;

  return (
    <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
      Model
      <select
        aria-label="Preview model size"
        value={value ? "small" : "standard"}
        onChange={(event) =>
          onSelect((event.target as HTMLSelectElement).value === "small")
        }
        className={SELECT_CLASS}
      >
        <option value="standard">Standard</option>
        <option value="small">Small-model</option>
      </select>
    </label>
  );
}

/**
 * Badge marking that the selected combination matches the device's live one.
 * @returns Badge element
 */
function LiveBadge(): preact.JSX.Element {
  return (
    <span
      title="This is the combination your current notation + model settings use."
      className="shrink-0 text-xs font-medium text-amber-600 dark:text-amber-400"
    >
      ★ Current settings
    </span>
  );
}

interface PreviewSizeProps {
  status: SkillsPreviewStatus;
}

/**
 * Right-aligned size readout: exact character count and an approximate token
 * count (see token-estimate.ts). Shows a placeholder until the preview loads.
 * @param props - Size props
 * @returns Size element
 */
function PreviewSize(props: PreviewSizeProps): preact.JSX.Element {
  const { status } = props;

  if (status.kind !== "ready") {
    return <span className="shrink-0 text-xs text-zinc-400">—</span>;
  }

  return (
    <CharTokenCount chars={status.preview.charCount} className="shrink-0" />
  );
}

interface PreviewBodyProps {
  status: SkillsPreviewStatus;
  /** The Preview/Source view toggle, centered in the body header (all states). */
  viewSlot: preact.JSX.Element;
}

/**
 * The assembled-blob body: a loading/error state, or the read-only skills text
 * with a caption naming the two slots this combination selects (the driver,
 * whose manifest names every other fragment, and the notation head) and a Copy
 * button. Every state is
 * wrapped in {@link PreviewFrame} so the view toggle stays centered in the same
 * on-screen spot as the editor's toggle — switching views never moves it.
 * @param props - Body props
 * @returns Body element
 */
function PreviewBody(props: PreviewBodyProps): preact.JSX.Element {
  const { status, viewSlot } = props;

  if (status.kind === "loading") {
    return (
      <PreviewFrame viewSlot={viewSlot}>
        <div className="flex-1 flex items-center justify-center text-zinc-500">
          Assembling preview…
        </div>
      </PreviewFrame>
    );
  }

  if (status.kind === "error") {
    return (
      <PreviewFrame viewSlot={viewSlot}>
        <div className="flex-1 flex items-center justify-center px-8 text-center text-red-600 dark:text-red-400">
          {status.message}
        </div>
      </PreviewFrame>
    );
  }

  const { skills, head, driver, dropped, warnings } = status.preview;

  return (
    <PreviewFrame
      viewSlot={viewSlot}
      left={
        <span className="min-w-0 truncate text-xs text-zinc-400 dark:text-zinc-500">
          Driver: {driver} · Notation: {head}
        </span>
      }
      right={
        <CopyButton text={skills} className={`shrink-0 ${CHIP_BUTTON_CLASS}`} />
      }
    >
      {warnings.length > 0 && <PreviewWarnings warnings={warnings} />}
      {dropped.length > 0 && <DroppedNote dropped={dropped} />}
      <MarkdownEditor
        key={skills}
        ariaLabel="Assembled skills preview"
        initialValue={skills}
        readOnly={true}
        onChange={noop}
        className="flex-1 min-h-0"
      />
    </PreviewFrame>
  );
}

interface PreviewFrameProps {
  viewSlot: preact.JSX.Element;
  /** Left cell of the toggle row (the fragment caption in the ready state). */
  left?: preact.JSX.Element;
  /** Right cell of the toggle row (the Copy button in the ready state). */
  right?: preact.JSX.Element;
  children: preact.ComponentChildren;
}

/**
 * The preview content frame: the shared centered column plus a top row that
 * keeps the Preview/Source toggle at the page center — the SAME spot as the
 * editor's toggle — across the loading, error, and ready states. The caption and
 * Copy button fill the row's sides only when there's a blob to describe.
 * @param props - Frame props
 * @returns Frame element
 */
function PreviewFrame(props: PreviewFrameProps): preact.JSX.Element {
  const { viewSlot, left, right, children } = props;

  return (
    <div
      className={`mx-auto w-full ${DOUBLE_PANE_WIDTH} flex flex-col h-full p-4 gap-2 overflow-hidden`}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center h-7 gap-3">
        <div className="min-w-0 justify-self-start">{left}</div>
        <div className="justify-self-center">{viewSlot}</div>
        <div className="justify-self-end">{right}</div>
      </div>
      {children}
    </div>
  );
}

interface DroppedNoteProps {
  dropped: string[];
}

/**
 * Names the fragments this blob is missing because the tools that would use them
 * are switched off in Settings. Without it the preview just looks short — the
 * gating is the only part of assembly nothing else on screen accounts for.
 * @param props - Note props
 * @returns Note element
 */
function DroppedNote(props: DroppedNoteProps): preact.JSX.Element {
  const { dropped } = props;

  return (
    <div className="shrink-0 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-2 text-xs text-zinc-600 dark:text-zinc-400">
      <span className="font-medium">Left out — no enabled tool uses them:</span>{" "}
      <span className="font-mono">{dropped.join(", ")}</span>
    </div>
  );
}

interface PreviewWarningsProps {
  warnings: string[];
}

/**
 * Banner listing assembly warnings (unknown fragments, refused nesting, unsafe
 * refs, overrides keyed to a retired slot) so a broken user override is visible
 * here rather than silently shortening the blob.
 * @param props - Warnings props
 * @returns Banner element
 */
function PreviewWarnings(props: PreviewWarningsProps): preact.JSX.Element {
  const { warnings } = props;

  return (
    <div
      role="alert"
      className="shrink-0 rounded-md border border-amber-400 dark:border-amber-500/50 bg-amber-50 dark:bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300"
    >
      <span className="font-medium">
        ⚠ This override didn't fully assemble:
      </span>
      <ul className="mt-1 ml-4 list-disc space-y-0.5">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Whether the selected combination matches the device's live one.
 * @param selected - The combination being previewed
 * @param currentMode - The device's live combination (null until /config loads)
 * @returns True when both fields match the live combination
 */
function isLive(
  selected: SkillsCombination,
  currentMode: SkillsCombination | null,
): boolean {
  return (
    currentMode?.notation === selected.notation &&
    currentMode.smallModelMode === selected.smallModelMode
  );
}
