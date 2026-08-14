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
    <div className="flex h-screen flex-col bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-200">
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
        enabledToolsOnly={preview.enabledToolsOnly}
        viewSlot={viewSlot}
        onNotation={preview.setNotation}
        onSmallModel={preview.setSmallModelMode}
        onEnabledToolsOnly={preview.setEnabledToolsOnly}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <PreviewBody status={preview.status} />
      </div>
    </div>
  );
}

// --- Helpers below main export ---

interface PreviewControlsProps {
  selected: SkillsCombination;
  currentMode: SkillsCombination | null;
  status: SkillsPreviewStatus;
  enabledToolsOnly: boolean;
  viewSlot: preact.JSX.Element;
  onNotation: (notation: Notation) => void;
  onSmallModel: (smallModelMode: boolean) => void;
  onEnabledToolsOnly: (enabledToolsOnly: boolean) => void;
}

/**
 * Controls strip: the notation + model-size pickers and the tool-gating
 * checkbox, then (right aligned) the live-combination badge, the assembled
 * blob's size, and the view toggle. The toggle ends this strip and the fragment
 * editor's alike, so switching views never moves it.
 * @param props - Controls props
 * @returns Controls element
 */
function PreviewControls(props: PreviewControlsProps): preact.JSX.Element {
  const { selected, currentMode, status, enabledToolsOnly, viewSlot } = props;
  const { onNotation, onSmallModel, onEnabledToolsOnly } = props;

  return (
    <div className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-700">
      <div
        className={`mx-auto w-full ${DOUBLE_PANE_WIDTH} flex flex-wrap items-center gap-x-3 gap-y-2`}
      >
        <NotationSelect value={selected.notation} onSelect={onNotation} />
        <ModelSelect value={selected.smallModelMode} onSelect={onSmallModel} />
        <EnabledToolsToggle
          value={enabledToolsOnly}
          onSelect={onEnabledToolsOnly}
        />
        <div className="ml-auto flex items-center gap-3">
          {isLive(selected, currentMode) && <LiveBadge />}
          <PreviewSize status={status} />
          {viewSlot}
        </div>
      </div>
    </div>
  );
}

interface EnabledToolsToggleProps {
  value: boolean;
  onSelect: (enabledToolsOnly: boolean) => void;
}

/**
 * Checkbox gating the preview on the tools switched on in Settings — the same
 * toolset a new conversation connects with, so the blob matches what the AI will
 * actually be told. Off previews every fragment, which is how to read one whose
 * tools are currently switched off.
 * @param props - Toggle props
 * @returns Toggle element
 */
function EnabledToolsToggle(
  props: EnabledToolsToggleProps,
): preact.JSX.Element {
  const { value, onSelect } = props;

  return (
    <label
      className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"
      title="On: leaves out the sections no enabled tool uses, like a new conversation would. Off: shows every section."
    >
      <input
        type="checkbox"
        checked={value}
        onChange={(event) =>
          onSelect((event.target as HTMLInputElement).checked)
        }
        className="h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-600"
      />
      Enabled tools only
    </label>
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
}

/**
 * The assembled-blob body: a loading/error state, or the read-only skills text
 * with a caption naming the two slots this combination selects (the driver,
 * whose manifest names every other fragment, and the notation head) and a Copy
 * button.
 * @param props - Body props
 * @returns Body element
 */
function PreviewBody(props: PreviewBodyProps): preact.JSX.Element {
  const { status } = props;

  if (status.kind === "loading") {
    return (
      <PreviewFrame>
        <div className="flex flex-1 items-center justify-center text-zinc-500">
          Assembling preview…
        </div>
      </PreviewFrame>
    );
  }

  if (status.kind === "error") {
    return (
      <PreviewFrame>
        <div className="flex flex-1 items-center justify-center px-8 text-center text-red-600 dark:text-red-400">
          {status.message}
        </div>
      </PreviewFrame>
    );
  }

  const { skills, head, driver, dropped, warnings } = status.preview;

  return (
    <PreviewFrame
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
        className="min-h-0 flex-1"
      />
    </PreviewFrame>
  );
}

interface PreviewFrameProps {
  /** Left cell of the caption row (the fragment caption in the ready state). */
  left?: preact.JSX.Element;
  /** Right cell of the caption row (the Copy button in the ready state). */
  right?: preact.JSX.Element;
  children: preact.ComponentChildren;
}

/**
 * The preview content frame: the shared centered column plus a caption row.
 * The row is kept (empty) in the loading and error states so the blob doesn't
 * jump up the page once it arrives.
 * @param props - Frame props
 * @returns Frame element
 */
function PreviewFrame(props: PreviewFrameProps): preact.JSX.Element {
  const { left, right, children } = props;

  return (
    <div
      className={`mx-auto w-full ${DOUBLE_PANE_WIDTH} flex h-full flex-col gap-2 overflow-hidden p-4`}
    >
      <div className="flex h-7 items-center justify-between gap-3">
        <div className="min-w-0">{left}</div>
        <div>{right}</div>
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
    <div className="shrink-0 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
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
      className="shrink-0 rounded-md border border-amber-400 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300"
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
