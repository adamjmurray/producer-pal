// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { useContextMemory } from "#webui/hooks/context/use-context-memory";
import { useGlobalContextMemory } from "#webui/hooks/context/use-global-context-memory";
import { type ContextEditorLabels, ContextScreen } from "./ContextScreen";

type ContextTab = "project" | "global";

const PROJECT_LABELS: ContextEditorLabels = {
  title: "Project Context",
  loadingLabel: "Loading project context…",
  closeAriaLabel: "Close context editor",
  clearConfirmMessage: "Clear all project memory? This cannot be undone.",
  externalUpdateMessage: "Memory was updated outside the editor.",
};

const GLOBAL_LABELS: ContextEditorLabels = {
  title: "Global Context",
  loadingLabel: "Loading global context…",
  closeAriaLabel: "Close context editor",
  clearConfirmMessage: "Clear all global context? This cannot be undone.",
  externalUpdateMessage: "Global context was updated outside the editor.",
};

interface ContextTabsProps {
  /** Close the overlay; omitted on the standalone `/context` page. */
  onClose?: () => void;
}

/**
 * Multi-document context editor: a Project | Global tab strip over a shared
 * {@link ContextScreen}. Both document hooks stay mounted (so each keeps
 * polling for external writes and switching tabs shows already-loaded content
 * without a flash), while the active one is handed to the editor. Keying the
 * screen by tab remounts it on switch so its uncontrolled editor re-seeds from
 * the newly-active document, and the outgoing editor flushes any pending save
 * on unmount.
 * @param props - Tabs props
 * @returns Tabbed editor element
 */
export function ContextTabs(props: ContextTabsProps = {}): preact.JSX.Element {
  const [tab, setTab] = useState<ContextTab>("project");
  const projectMemory = useContextMemory();
  const globalMemory = useGlobalContextMemory();

  const isProject = tab === "project";

  return (
    <ContextScreen
      key={tab}
      memory={isProject ? projectMemory : globalMemory}
      labels={isProject ? PROJECT_LABELS : GLOBAL_LABELS}
      tabSlot={<TabStrip tab={tab} onSelect={setTab} />}
      onClose={props.onClose}
    />
  );
}

// --- Helpers below main export ---

interface TabStripProps {
  tab: ContextTab;
  onSelect: (tab: ContextTab) => void;
}

/**
 * Header-left tab strip switching between the project and global documents.
 * @param props - Tab strip props
 * @returns Tab strip element
 */
function TabStrip(props: TabStripProps): preact.JSX.Element {
  const { tab, onSelect } = props;

  return (
    <div
      role="tablist"
      aria-label="Context scope"
      className="flex items-center gap-1"
    >
      <TabButton
        label="Project"
        active={tab === "project"}
        onSelect={() => onSelect("project")}
      />
      <TabButton
        label="Global"
        active={tab === "global"}
        onSelect={() => onSelect("global")}
      />
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
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={`px-2 py-1 text-base rounded transition-colors ${
        active
          ? "font-semibold text-zinc-900 dark:text-zinc-100"
          : "font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}
