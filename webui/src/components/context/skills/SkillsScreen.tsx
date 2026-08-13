// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useLayoutEffect, useState } from "preact/hooks";
import { CollectionStatusScreen } from "#webui/components/context/collection/CollectionScreen";
import { type UseSkillOverridesReturn } from "#webui/hooks/context/use-skill-overrides";
import { SkillSlotScreen } from "./SkillSlotScreen";
import { SkillsPreviewScreen } from "./SkillsPreviewScreen";
import { type SkillsView, SkillsViewToggle } from "./SkillsViewToggle";

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
  // carries the previous slot's "Saved"/"Save failed" onto the next one (the
  // overrides hook outlives the per-slot SkillSlotScreen remount, so its status
  // persists). A LAYOUT effect (not a passive one) so the reset lands before the
  // freshly-keyed SkillSlotScreen paints — a passive effect runs after paint,
  // flashing the prior slot's status for one frame on the new slot.
  const { resetSaveStatus } = overrides;

  useLayoutEffect(() => {
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
