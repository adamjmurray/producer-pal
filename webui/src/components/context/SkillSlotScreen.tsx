// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useContextEditorState } from "#webui/hooks/context/use-context-editor-state";
import { type UseDocMemoryReturn } from "#webui/hooks/context/use-doc-memory";
import {
  type SkillSlotView,
  type UseSkillOverridesReturn,
} from "#webui/hooks/context/use-skill-overrides";
import {
  ContextHeader,
  DOUBLE_PANE_WIDTH,
  ExternalUpdateBanner,
} from "./ContextScreen";
import { OverridePanes } from "./OverridePanes";
import { SkillSlotSelect } from "./SkillSlotSelect";

const RESET_CONFIRM =
  "Reset this skill fragment to Producer Pal's built-in? This deletes your override.";
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
  /** Close the overlay (omitted on the standalone /context page). */
  onClose?: () => void;
}

/**
 * Editor for one skills-fragment override, shown side by side with the built-in
 * for reference. Keyed by the selected slot so the uncontrolled editor re-seeds
 * on slot switch. Reuses the context-editor autosave lifecycle by adapting the
 * selected slot to a single-document {@link UseDocMemoryReturn}: save writes the
 * override, clear resets it to the built-in (deleting the file). The built-in
 * pane is selectable read-only text with a Copy button, so a user can fork the
 * default by copying it into the (empty-by-design) override pane.
 * @param props - Screen props
 * @returns Screen element
 */
export function SkillSlotScreen(
  props: SkillSlotScreenProps,
): preact.JSX.Element {
  const { overrides, slots, slot, onSelectSlot, tabSlot, onClose } = props;
  const memory = slotAsDocMemory(overrides, slot);
  const editor = useContextEditorState(memory, RESET_CONFIRM);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">
      <ContextHeader
        title="Skills"
        tabSlot={tabSlot}
        closeAriaLabel={CLOSE_ARIA_LABEL}
        status={memory.status}
        saveStatus={overrides.saveStatus}
        dirty={editor.dirty}
        onClose={onClose}
      />
      <SkillControls
        slots={slots}
        selected={slot.name}
        onSelectSlot={onSelectSlot}
        slot={slot}
        onReset={() => void editor.handleClear()}
      />
      <div
        className={`mx-auto w-full ${DOUBLE_PANE_WIDTH} flex-1 min-h-0 flex flex-col p-4 gap-3 overflow-hidden`}
      >
        {editor.externalUpdate && (
          <ExternalUpdateBanner
            message={EXTERNAL_UPDATE_MESSAGE}
            onReload={editor.handleReload}
          />
        )}
        <OverridePanes
          editorKey={editor.editorKey}
          value={slot.override}
          builtIn={slot.builtIn}
          overrideLabel="Your override"
          onChange={editor.handleChange}
          onBlur={editor.handleBlur}
        />
      </div>
    </div>
  );
}

// --- Helpers below main export ---

/**
 * Adapt one slot of the collection hook to the single-document memory shape
 * `useContextEditorState` expects. The screen is keyed by slot, so this is
 * rebuilt (and re-seeded) on every slot switch.
 * @param overrides - The collection hook
 * @param slot - The slot being edited
 * @returns A document-memory view of that slot
 */
function slotAsDocMemory(
  overrides: UseSkillOverridesReturn,
  slot: SkillSlotView,
): UseDocMemoryReturn {
  return {
    status: { kind: "ready", content: slot.override },
    saveStatus: overrides.saveStatus,
    saveError: overrides.saveError,
    save: (content: string) => overrides.saveSlot(slot.name, content),
    clear: () => overrides.resetSlot(slot.name),
    refresh: overrides.refresh,
  };
}

interface SkillControlsProps {
  slots: SkillSlotView[];
  selected: string;
  onSelectSlot: (name: string) => void;
  slot: SkillSlotView;
  onReset: () => void;
}

/**
 * Controls strip: the slot dropdown, a one-line explainer for the selected slot,
 * a drift note, and a "Reset to default" action shown only when the slot has an
 * override. The border spans full width while the content is centered to match
 * the editor below.
 * @param props - Controls props
 * @returns Controls element
 */
function SkillControls(props: SkillControlsProps): preact.JSX.Element {
  const { slots, selected, onSelectSlot, slot, onReset } = props;

  return (
    <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-700">
      <div
        className={`mx-auto w-full ${DOUBLE_PANE_WIDTH} flex items-center gap-3`}
      >
        <SkillSlotSelect
          slots={slots}
          selected={selected}
          onSelect={onSelectSlot}
        />
        <span
          className="min-w-0 flex-1 truncate text-xs text-zinc-500 dark:text-zinc-400"
          title={slot.description}
        >
          {slot.description}
        </span>
        {slot.drifted && (
          <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">
            ⚠ Built-in changed since you forked
            {slot.forkedFromVersion != null
              ? ` (v${slot.forkedFromVersion})`
              : ""}
            .
          </span>
        )}
        {slot.override !== "" && (
          <button
            type="button"
            onClick={onReset}
            className="shrink-0 text-xs text-zinc-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            Reset to default
          </button>
        )}
      </div>
    </div>
  );
}
