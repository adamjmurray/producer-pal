// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { type UseSkillOverridesReturn } from "#webui/hooks/context/use-skill-overrides";
import { ContextHeader } from "./ContextScreen";
import { SkillSlotScreen } from "./SkillSlotScreen";
import { SkillsPreviewScreen } from "./SkillsPreviewScreen";

const CLOSE_ARIA_LABEL = "Close context editor";

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
 * The Skills tab. A Fragments | Preview toggle switches between editing the
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
      <StatusScreen
        tabSlot={tabSlot}
        viewSlot={viewSlot}
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
      <StatusScreen
        tabSlot={tabSlot}
        viewSlot={viewSlot}
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
 * Segmented control switching the Skills tab between the fragment editor and the
 * assembled-blob preview.
 * @param props - Toggle props
 * @returns Toggle element
 */
function SkillsViewToggle(props: SkillsViewToggleProps): preact.JSX.Element {
  const { view, onSelect } = props;

  return (
    <div
      role="tablist"
      aria-label="Skills view"
      className="inline-flex rounded-md border border-zinc-300 dark:border-zinc-700 overflow-hidden text-xs"
    >
      <ViewToggleButton
        label="Fragments"
        active={view === "fragments"}
        onSelect={() => onSelect("fragments")}
      />
      <ViewToggleButton
        label="Preview"
        active={view === "preview"}
        onSelect={() => onSelect("preview")}
      />
    </div>
  );
}

interface ViewToggleButtonProps {
  label: string;
  active: boolean;
  onSelect: () => void;
}

/**
 * A single segment of the Fragments | Preview toggle.
 * @param props - Button props
 * @returns Button element
 */
function ViewToggleButton(props: ViewToggleButtonProps): preact.JSX.Element {
  const { label, active, onSelect } = props;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={`px-2.5 py-1 transition-colors ${
        active
          ? "bg-zinc-200 dark:bg-zinc-700 font-medium text-zinc-900 dark:text-zinc-100"
          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}

interface StatusScreenProps {
  tabSlot: preact.JSX.Element;
  viewSlot: preact.JSX.Element;
  onClose?: () => void;
  message: string;
  tone: "muted" | "error";
}

/**
 * Loading/error/empty state for the fragments view: the shared header, a controls
 * row holding the view toggle (so Preview stays reachable), and a centered
 * message.
 * @param props - Status screen props
 * @returns Status screen element
 */
function StatusScreen(props: StatusScreenProps): preact.JSX.Element {
  const { tabSlot, viewSlot, onClose, message, tone } = props;
  const status =
    tone === "error" ? ({ kind: "error", message } as const) : undefined;

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">
      <ContextHeader
        title="Skills"
        tabSlot={tabSlot}
        closeAriaLabel={CLOSE_ARIA_LABEL}
        status={status ?? { kind: "loading" }}
        saveStatus="idle"
        dirty={false}
        onClose={onClose}
      />
      <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-700">
        {viewSlot}
      </div>
      <div
        className={`flex items-center justify-center flex-1 px-8 text-center ${
          tone === "error" ? "text-red-600 dark:text-red-400" : "text-zinc-500"
        }`}
      >
        {message}
      </div>
    </div>
  );
}
