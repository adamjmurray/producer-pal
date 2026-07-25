// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useMemo, useState } from "preact/hooks";
import { makeContextIoHandlers } from "#webui/components/context/context-io";
import { ContextIoButtons } from "#webui/components/context/ContextIoButtons";
import {
  DOUBLE_PANE_WIDTH,
  ExternalUpdateBanner,
  SINGLE_WIDTH,
} from "#webui/components/context/ContextScreen";
import { ContextHeader } from "#webui/components/context/editor/ContextHeader";
import { DriftNote } from "#webui/components/context/editor/DriftNote";
import { OverridePanes } from "#webui/components/context/editor/OverridePanes";
import {
  MarkdownDropZone,
  useImportNotice,
} from "#webui/components/context/MarkdownDropZone";
import { useContextEditorState } from "#webui/hooks/context/use-context-editor-state";
import { type UseDocReturn } from "#webui/hooks/context/use-doc";
import {
  type SkillSlotView,
  type UseSkillOverridesReturn,
} from "#webui/hooks/context/use-skill-overrides";
import { SkillSlotSelect } from "./SkillSlotSelect";

const RESET_CONFIRM =
  "Reset this skill fragment to Producer Pal's default? This deletes your override.";
const EXTERNAL_UPDATE_MESSAGE =
  "This skill fragment was updated outside the editor.";
const CLOSE_ARIA_LABEL = "Close context editor";

interface SkillSlotScreenProps {
  /** The whole collection hook (per-slot save/reset lives here). */
  overrides: UseSkillOverridesReturn;
  /** Every slot, for the dropdown. */
  slots: SkillSlotView[];
  /** The slot currently being edited (this screen is keyed by its name). */
  slot: SkillSlotView;
  /** Change the selected slot. */
  onSelectSlot: (name: string) => void;
  /** The Project | Global | Instructions | Skills tab strip. */
  tabSlot: preact.JSX.Element;
  /** The Preview/Source view toggle for the Skills tab. */
  viewSlot: preact.JSX.Element;
  /** Close the overlay (omitted on the standalone /context page). */
  onClose?: () => void;
}

/**
 * Editor for one skills-fragment override. With no override the built-in is
 * shown read-only with a "Customize" button; once customized, the editable
 * override shows and the built-in is revealed on demand (see
 * {@link OverridePanes}). Keyed by the selected slot so the uncontrolled editor
 * re-seeds on slot switch. Reuses the context-editor autosave lifecycle by
 * adapting the selected slot to a single-document {@link UseDocReturn}:
 * save writes the override, clear resets it to the built-in (deleting the file),
 * and Customize forks the built-in into the override via the import handler.
 * @param props - Screen props
 * @returns Screen element
 */
export function SkillSlotScreen(
  props: SkillSlotScreenProps,
): preact.JSX.Element {
  const { overrides, slots, slot, onSelectSlot, tabSlot, viewSlot, onClose } =
    props;
  const doc = useSlotDoc(overrides, slot);
  const editor = useContextEditorState(doc, RESET_CONFIRM);
  const importNotice = useImportNotice();
  const io = makeContextIoHandlers(
    editor,
    `producer-pal-skill-${slot.name}`,
    importNotice.showNotice,
    importNotice.clearNotice,
  );
  const [showBuiltIn, setShowBuiltIn] = useState(false);
  // Match the other doc tabs at rest; widen to two columns only when the
  // built-in reference is revealed. Resetting collapses the reveal (see
  // OverridePanes), so the built-in-only view that follows stays single-column.
  const widthClass = showBuiltIn ? DOUBLE_PANE_WIDTH : SINGLE_WIDTH;

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">
      <ContextHeader
        title="Skills"
        tabSlot={tabSlot}
        closeAriaLabel={CLOSE_ARIA_LABEL}
        status={doc.status}
        saveStatus={overrides.saveStatus}
        dirty={editor.dirty}
        onClose={onClose}
      />
      <SkillControls
        slots={slots}
        selected={slot.name}
        onSelectSlot={onSelectSlot}
        slot={slot}
        widthClass={widthClass}
        onImport={io.onImport}
        onExport={io.onExport}
        onSetEnabled={(enabled) =>
          void overrides.setSlotEnabled(slot.name, enabled)
        }
      />
      <div
        className={`mx-auto w-full ${widthClass} flex-1 min-h-0 flex flex-col p-4 gap-3 overflow-hidden`}
      >
        {editor.externalUpdate && (
          <ExternalUpdateBanner
            message={EXTERNAL_UPDATE_MESSAGE}
            onReload={editor.handleReload}
          />
        )}
        <MarkdownDropZone
          onImportText={io.onImportText}
          notice={importNotice.notice}
          onReject={importNotice.showNotice}
          className="flex-1 min-h-0 flex flex-col"
        >
          <OverridePanes
            editorKey={editor.editorKey}
            hasOverride={editor.hasOverride}
            value={slot.override}
            builtIn={slot.builtIn}
            overrideLabel="Your override"
            centerControl={viewSlot}
            showBuiltIn={showBuiltIn}
            onToggleBuiltIn={setShowBuiltIn}
            onReset={editor.handleClear}
            onCustomize={() => void editor.handleImport(slot.builtIn)}
            onChange={editor.handleChange}
            onBlur={editor.handleBlur}
          />
        </MarkdownDropZone>
      </div>
    </div>
  );
}

// --- Helpers below main export ---

/**
 * Adapt one slot of the collection hook to the single-document doc shape
 * `useContextEditorState` expects. The screen is keyed by slot, so this is
 * rebuilt (and re-seeded) on every slot switch.
 *
 * The `status` object is memoized on `slot.override` alone: `useContextEditorState`
 * keys its external-update effect on `status` identity, so a fresh object on
 * every render (e.g. the intermediate `saveStatus:"saving"` render) would fire it
 * spuriously — flashing a false "updated outside the editor" banner during each
 * autosave, and risking a Reload that adopts the stale pre-echo value.
 * @param overrides - The collection hook
 * @param slot - The slot being edited
 * @returns A doc view of that slot
 */
function useSlotDoc(
  overrides: UseSkillOverridesReturn,
  slot: SkillSlotView,
): UseDocReturn {
  const status = useMemo<UseDocReturn["status"]>(
    () => ({ kind: "ready", content: slot.override }),
    [slot.override],
  );

  return useMemo<UseDocReturn>(
    () => ({
      status,
      saveStatus: overrides.saveStatus,
      saveError: overrides.saveError,
      save: (content: string) => overrides.saveSlot(slot.name, content),
      clear: () => overrides.resetSlot(slot.name),
      refresh: overrides.refresh,
    }),
    [status, overrides, slot.name],
  );
}

interface SkillControlsProps {
  slots: SkillSlotView[];
  selected: string;
  onSelectSlot: (name: string) => void;
  slot: SkillSlotView;
  /** Content width — tracks the editor below so the strip stays aligned. */
  widthClass: string;
  onImport: () => void;
  onExport: () => void;
  /** Switch the selected fragment on or off. */
  onSetEnabled: (enabled: boolean) => void;
}

/**
 * Controls strip: the slot dropdown, the include toggle, a one-line explainer
 * for the selected slot, and a drift note. The border spans full width while the
 * content is centered to match the editor below. The Preview/Source view toggle
 * sits in the editor's pane header (see OverridePanes), and resetting an
 * override to the built-in lives in the revealed built-in header there — neither
 * belongs here.
 * @param props - Controls props
 * @returns Controls element
 */
function SkillControls(props: SkillControlsProps): preact.JSX.Element {
  const { slots, selected, onSelectSlot, slot } = props;
  const { widthClass, onImport, onExport, onSetEnabled } = props;

  return (
    <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-700">
      <div className={`mx-auto w-full ${widthClass} flex items-center gap-3`}>
        <SkillSlotSelect
          slots={slots}
          selected={selected}
          onSelect={onSelectSlot}
        />
        <IncludeToggle slot={slot} onSetEnabled={onSetEnabled} />
        <span className="min-w-0 flex-1 text-xs text-zinc-500 dark:text-zinc-400">
          {slot.description}
        </span>
        <DriftNote
          drifted={slot.drifted}
          forkedFromVersion={slot.forkedFromVersion}
        />
        <ContextIoButtons onImport={onImport} onExport={onExport} />
      </div>
    </div>
  );
}

interface IncludeToggleProps {
  slot: SkillSlotView;
  onSetEnabled: (enabled: boolean) => void;
}

/**
 * Checkbox switching the selected fragment in or out of the assembled skills —
 * the one-click form of deleting its `@include` line, and unlike an emptied
 * override it keeps the body for when it goes back on. Rendered as nothing for
 * the whole-document drivers, which have no line to drop (see
 * SkillSlotDef.alwaysOn).
 * @param props - Toggle props
 * @returns Toggle element, or null when the slot can't be switched off
 */
function IncludeToggle(props: IncludeToggleProps): preact.JSX.Element | null {
  const { slot, onSetEnabled } = props;

  if (!slot.canDisable) return null;

  return (
    <label
      className="shrink-0 flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400"
      title="Off: this section is left out of the skills the AI receives. Your override is kept."
    >
      <input
        type="checkbox"
        checked={slot.enabled}
        onChange={(event) =>
          onSetEnabled((event.target as HTMLInputElement).checked)
        }
        className="h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-600"
      />
      Include
    </label>
  );
}
