// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "preact/hooks";
import { CollectionStatusScreen } from "#webui/components/context/collection/CollectionScreen";
import { CHIP_BUTTON_CLASS } from "#webui/components/context/editor/context-buttons";
import { type UseSkillOverridesReturn } from "#webui/hooks/context/use-skill-overrides";
import { SkillSlotScreen } from "./SkillSlotScreen";
import { SkillsPreviewScreen } from "./SkillsPreviewScreen";

/** The two Skills-tab views: edit the fragment overrides, or preview the blob. */
type SkillsView = "fragments" | "preview";

interface SkillsScreenProps {
  /** The skills-overrides collection hook (mounted in ContextTabs). */
  overrides: UseSkillOverridesReturn;
  /** The Project | Global | Instructions | Skills tab strip. */
  tabSlot: preact.JSX.Element;
  /** Close the overlay (omitted on the standalone /context page). */
  onClose?: () => void;
}

/**
 * The Skills tab. A Preview/Source toggle switches between editing the
 * built-in fragment overrides ({@link SkillSlotScreen}) and previewing the
 * assembled blob for any combination ({@link SkillsPreviewScreen}). The preview
 * is independent of the overrides collection, so it is reachable even while the
 * fragments list is still loading or errored. Owns the selected-slot state
 * (which must persist across slot switches); loading/error/empty states reuse
 * the shared context header.
 * @param props - Screen props
 * @returns Screen element
 */
export function SkillsScreen(props: SkillsScreenProps): preact.JSX.Element {
  const { overrides, tabSlot, onClose } = props;
  const [view, setView] = useState<SkillsView>("fragments");
  const [selected, setSelected] = useState<string | null>(null);
  const viewSlot = <SkillsViewToggle view={view} onSelect={setView} />;

  // Reset the save indicator whenever the edited slot changes, so it never
  // carries the previous slot's "Saved" onto the next one (the overrides hook
  // outlives the per-slot SkillSlotScreen remount, so its status persists).
  const { resetSaveStatus } = overrides;

  useEffect(() => {
    resetSaveStatus();
  }, [selected, resetSaveStatus]);

  if (view === "preview") {
    return (
      <SkillsPreviewScreen
        tabSlot={tabSlot}
        viewSlot={viewSlot}
        onClose={onClose}
      />
    );
  }

  if (overrides.status.kind !== "ready") {
    return (
      <CollectionStatusScreen
        title="Skills"
        tabSlot={tabSlot}
        belowHeader={viewSlot}
        onClose={onClose}
        message={
          overrides.status.kind === "error"
            ? overrides.status.message
            : "Loading skills…"
        }
        tone={overrides.status.kind === "error" ? "error" : "muted"}
      />
    );
  }

  const slots = overrides.status.slots;

  if (slots.length === 0) {
    return (
      <CollectionStatusScreen
        title="Skills"
        tabSlot={tabSlot}
        belowHeader={viewSlot}
        onClose={onClose}
        message="No skills fragments available."
        tone="muted"
      />
    );
  }

  // Length checked above, so index 0 is present (noUncheckedIndexedAccess).
  const first = slots[0] as (typeof slots)[number];
  const active = slots.find((slot) => slot.name === selected) ?? first;

  return (
    <SkillSlotScreen
      key={active.name}
      overrides={overrides}
      slots={slots}
      slot={active}
      onSelectSlot={setSelected}
      tabSlot={tabSlot}
      viewSlot={viewSlot}
      onClose={onClose}
    />
  );
}

// --- Helpers below main export ---

interface SkillsViewToggleProps {
  view: SkillsView;
  onSelect: (view: SkillsView) => void;
}

/**
 * A single compact chip button toggling the Skills tab between the fragment
 * editor and the assembled-blob preview, labelled with the view it switches TO
 * ("Preview" while editing, "Source" while previewing). Compact by design so it
 * fits the row above the editor on narrow screens, where the old two-segment
 * control crowded the controls strip. Shares the pane controls' button styling
 * (see CHIP_BUTTON_CLASS).
 * @param props - Toggle props
 * @returns Toggle button element
 */
function SkillsViewToggle(props: SkillsViewToggleProps): preact.JSX.Element {
  const { view, onSelect } = props;
  const previewing = view === "preview";

  return (
    <button
      type="button"
      onClick={() => onSelect(previewing ? "fragments" : "preview")}
      title={
        previewing
          ? "Show the raw skill fragment"
          : "Preview with included fragments inserted"
      }
      className={`shrink-0 ${CHIP_BUTTON_CLASS}`}
    >
      {previewing ? "Source" : "Preview"}
    </button>
  );
}
