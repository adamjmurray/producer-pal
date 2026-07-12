// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "preact/hooks";
import {
  LeaveGuardContext,
  useLeaveGuard,
} from "#webui/components/context/collection/leave-guard";
import { useContextMemory } from "#webui/hooks/context/use-context-memory";
import { type UseDocMemoryReturn } from "#webui/hooks/context/use-doc-memory";
import { useGlobalContextMemory } from "#webui/hooks/context/use-global-context-memory";
import { useMemoryCollection } from "#webui/hooks/context/use-memory-collection";
import { useSkillOverrides } from "#webui/hooks/context/use-skill-overrides";
import { useSystemPromptMemory } from "#webui/hooks/context/use-system-prompt-memory";
import { SYSTEM_INSTRUCTION } from "#webui/lib/config";
import { type ContextEditorLabels, ContextScreen } from "./ContextScreen";
import { MemoryScreen } from "./memory/MemoryScreen";
import { SkillsScreen } from "./skills/SkillsScreen";

/** Tabs backed by a single markdown document via useDocMemory. */
type DocTab = "project" | "global" | "instructions";
/**
 * All context editor tabs: the doc tabs plus the multi-fragment Skills override
 * tab and the multi-entry Memory tab.
 */
type ContextTab = DocTab | "skills" | "memory";

const CLOSE_ARIA_LABEL = "Close context editor";

const PROJECT_LABELS: ContextEditorLabels = {
  title: "Project Context",
  loadingLabel: "Loading project context…",
  closeAriaLabel: CLOSE_ARIA_LABEL,
  clearConfirmMessage: "Clear all project memory? This cannot be undone.",
  externalUpdateMessage: "Memory was updated outside the editor.",
  exportBasename: "producer-pal-project-context",
  description:
    "Notes about this Ableton project, like its genre and song structure, included in every conversation. Saved in this project's Max for Live device (delete the device and it's gone). The AI can edit them too.",
};

const GLOBAL_LABELS: ContextEditorLabels = {
  title: "Global Context",
  loadingLabel: "Loading global context…",
  closeAriaLabel: CLOSE_ARIA_LABEL,
  clearConfirmMessage: "Clear all global context? This cannot be undone.",
  externalUpdateMessage: "Global context was updated outside the editor.",
  exportBasename: "producer-pal-global-context",
  description:
    "Notes that apply across all your projects, like your musical style and preferences, included in every conversation. Saved on your computer. The AI can edit them too.",
};

const INSTRUCTIONS_LABELS: ContextEditorLabels = {
  title: "Custom Instructions",
  loadingLabel: "Loading custom instructions…",
  closeAriaLabel: CLOSE_ARIA_LABEL,
  clearConfirmMessage:
    "Reset to Producer Pal's default instructions? This deletes your custom system prompt.",
  externalUpdateMessage: "Custom instructions were updated outside the editor.",
  exportBasename: "producer-pal-custom-instructions",
  description:
    "Customize the system prompt for Producer Pal's chat. Only that chat uses it. External apps like Claude Desktop or Claude Code bring their own.",
  // Show the shipped default beside the editor with a Copy button, so users can
  // fork it instead of starting from a blank slate. This is the webui chat's
  // built-in instruction (not the ppal-connect skills blob), the same constant
  // the adapter falls back to when the override is empty.
  builtIn: SYSTEM_INSTRUCTION,
  overridePaneLabel: "Your instructions",
};

interface ContextTabsProps {
  /** Close the overlay; omitted on the standalone `/context` page. */
  onClose?: () => void;
  /**
   * A ref the parent (the App overlay) reads to route its own close paths —
   * Escape and backdrop click, which fire outside this subtree — through the
   * same leave guard the tab strip and header close use. Populated with
   * confirmLeave while mounted, cleared on unmount. Omitted on `/context`.
   */
  confirmLeaveRef?: { current: (() => boolean) | null };
}

/**
 * Multi-document context editor: a Project | Global | Instructions | Skills |
 * Memory tab strip. The three document tabs share a {@link ContextScreen}; the
 * Skills tab renders a {@link SkillsScreen} (a multi-fragment override editor)
 * and the Memory tab a {@link MemoryScreen} (a multi-entry collection manager).
 * All hooks stay mounted (so each keeps polling for external writes and
 * switching tabs shows already-loaded content without a flash), while the
 * active one is handed to its screen. Keying the doc screen by tab remounts it
 * on switch so its uncontrolled editor re-seeds from the newly-active document,
 * and the outgoing editor flushes any pending save on unmount.
 * @param props - Tabs props
 * @returns Tabbed editor element
 */
export function ContextTabs(props: ContextTabsProps = {}): preact.JSX.Element {
  const [tab, setTab] = useState<ContextTab>("project");
  const projectMemory = useContextMemory();
  const globalMemory = useGlobalContextMemory();
  const instructionsMemory = useSystemPromptMemory();
  const skillOverrides = useSkillOverrides();
  const memoryCollection = useMemoryCollection();

  const memoryByTab: Record<DocTab, UseDocMemoryReturn> = {
    project: projectMemory,
    global: globalMemory,
    instructions: instructionsMemory,
  };
  const labelsByTab: Record<DocTab, ContextEditorLabels> = {
    project: PROJECT_LABELS,
    global: GLOBAL_LABELS,
    instructions: INSTRUCTIONS_LABELS,
  };

  // Switching tabs or closing the overlay unmounts the active editor; an
  // unsaved new-memory draft registers a leave guard, so confirm a discard
  // first (a no-op elsewhere — nothing registers a guard).
  const leaveGuard = useLeaveGuard();

  // Publish confirmLeave so the parent overlay's Escape/backdrop close paths can
  // consult the same guard (leaveGuard has stable identity, so this runs once).
  const { confirmLeaveRef } = props;

  useEffect(() => {
    if (confirmLeaveRef == null) return;
    confirmLeaveRef.current = leaveGuard.confirmLeave;

    return () => {
      confirmLeaveRef.current = null;
    };
  }, [confirmLeaveRef, leaveGuard]);

  const selectTab = (next: ContextTab): void => {
    // Clicking the already-active tab unmounts nothing, so don't run the leave
    // guard — it would pop a spurious discard prompt over a dirty new draft.
    if (next === tab) return;
    if (leaveGuard.confirmLeave()) setTab(next);
  };

  const guardedClose =
    props.onClose == null
      ? undefined
      : (): void => {
          if (leaveGuard.confirmLeave()) props.onClose?.();
        };

  const tabStrip = <TabStrip tab={tab} onSelect={selectTab} />;

  let screen: preact.JSX.Element;

  if (tab === "skills") {
    screen = (
      <SkillsScreen
        overrides={skillOverrides}
        tabSlot={tabStrip}
        onClose={guardedClose}
      />
    );
  } else if (tab === "memory") {
    screen = (
      <MemoryScreen
        collection={memoryCollection}
        tabSlot={tabStrip}
        onClose={guardedClose}
      />
    );
  } else {
    screen = (
      <ContextScreen
        key={tab}
        memory={memoryByTab[tab]}
        labels={labelsByTab[tab]}
        tabSlot={tabStrip}
        onClose={guardedClose}
      />
    );
  }

  return (
    <LeaveGuardContext.Provider value={leaveGuard}>
      {screen}
    </LeaveGuardContext.Provider>
  );
}

// --- Helpers below main export ---

interface TabStripProps {
  tab: ContextTab;
  onSelect: (tab: ContextTab) => void;
}

/** The tab strip's tabs, in display order (id + button label). */
const TABS: readonly { id: ContextTab; label: string }[] = [
  { id: "project", label: "Project" },
  { id: "global", label: "Global" },
  { id: "instructions", label: "Instructions" },
  { id: "skills", label: "Skills" },
  { id: "memory", label: "Memory" },
];

/**
 * Header-left tab strip switching between the project, global, instructions,
 * skills, and memory editors.
 * @param props - Tab strip props
 * @returns Tab strip element
 */
function TabStrip(props: TabStripProps): preact.JSX.Element {
  const { tab, onSelect } = props;

  return (
    // A button group (not an ARIA tablist): each button switches the whole
    // editor screen — which remounts the strip — so the canonical roving-tabindex
    // / arrow-key tab model doesn't fit. Native buttons stay Tab-focusable and
    // Enter/Space-activatable; aria-pressed marks the active view.
    <div
      role="group"
      aria-label="Context editor tabs"
      className="flex items-center gap-1"
    >
      {TABS.map(({ id, label }) => (
        <TabButton
          key={id}
          label={label}
          active={tab === id}
          onSelect={() => onSelect(id)}
        />
      ))}
    </div>
  );
}

interface TabButtonProps {
  label: string;
  active: boolean;
  onSelect: () => void;
}

/**
 * A single tab button. Active tab reads as the current title (semibold, full
 * contrast); inactive tabs are muted and clickable.
 * @param props - Tab button props
 * @returns Tab button element
 */
function TabButton(props: TabButtonProps): preact.JSX.Element {
  const { label, active, onSelect } = props;

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={`shrink-0 whitespace-nowrap px-2 py-1 text-base rounded transition-colors ${
        active
          ? "font-semibold text-zinc-900 dark:text-zinc-100"
          : "font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}
