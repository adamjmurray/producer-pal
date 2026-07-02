// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { useContextMemory } from "#webui/hooks/context/use-context-memory";
import { type UseDocMemoryReturn } from "#webui/hooks/context/use-doc-memory";
import { useGlobalContextMemory } from "#webui/hooks/context/use-global-context-memory";
import { useSkillOverrides } from "#webui/hooks/context/use-skill-overrides";
import { useSystemPromptMemory } from "#webui/hooks/context/use-system-prompt-memory";
import { SYSTEM_INSTRUCTION } from "#webui/lib/config";
import { type ContextEditorLabels, ContextScreen } from "./ContextScreen";
import { SkillsScreen } from "./SkillsScreen";

/** Tabs backed by a single markdown document via useDocMemory. */
type DocTab = "project" | "global" | "instructions";
/** All context editor tabs (the doc tabs plus the multi-fragment Skills tab). */
type ContextTab = DocTab | "skills";

const CLOSE_ARIA_LABEL = "Close context editor";

const PROJECT_LABELS: ContextEditorLabels = {
  title: "Project Context",
  loadingLabel: "Loading project context…",
  closeAriaLabel: CLOSE_ARIA_LABEL,
  clearConfirmMessage: "Clear all project memory? This cannot be undone.",
  externalUpdateMessage: "Memory was updated outside the editor.",
  description:
    "Notes about this Ableton project — song direction, section plans, naming conventions — that Producer Pal keeps in mind. Saved with this project.",
};

const GLOBAL_LABELS: ContextEditorLabels = {
  title: "Global Context",
  loadingLabel: "Loading global context…",
  closeAriaLabel: CLOSE_ARIA_LABEL,
  clearConfirmMessage: "Clear all global context? This cannot be undone.",
  externalUpdateMessage: "Global context was updated outside the editor.",
  description:
    "Notes that apply to every project — your style, gear, and preferences — that Producer Pal keeps in mind in every chat.",
};

const INSTRUCTIONS_LABELS: ContextEditorLabels = {
  title: "Custom Instructions",
  loadingLabel: "Loading custom instructions…",
  closeAriaLabel: CLOSE_ARIA_LABEL,
  clearConfirmMessage:
    "Reset to Producer Pal's built-in instructions? This deletes your custom system prompt.",
  externalUpdateMessage: "Custom instructions were updated outside the editor.",
  description:
    "Fully replaces Producer Pal's built-in chat system prompt, including its tool-use and notation guidance. Leave empty to use the default.",
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
}

/**
 * Multi-document context editor: a Project | Global | Instructions | Skills tab
 * strip. The three document tabs share a {@link ContextScreen}; the Skills tab
 * renders a {@link SkillsScreen} instead (a multi-fragment override editor). All
 * hooks stay mounted (so each keeps polling for external writes and switching
 * tabs shows already-loaded content without a flash), while the active one is
 * handed to its screen. Keying the doc screen by tab remounts it on switch so
 * its uncontrolled editor re-seeds from the newly-active document, and the
 * outgoing editor flushes any pending save on unmount.
 * @param props - Tabs props
 * @returns Tabbed editor element
 */
export function ContextTabs(props: ContextTabsProps = {}): preact.JSX.Element {
  const [tab, setTab] = useState<ContextTab>("project");
  const projectMemory = useContextMemory();
  const globalMemory = useGlobalContextMemory();
  const instructionsMemory = useSystemPromptMemory();
  const skillOverrides = useSkillOverrides();

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
  const tabStrip = <TabStrip tab={tab} onSelect={setTab} />;

  if (tab === "skills") {
    return (
      <SkillsScreen
        overrides={skillOverrides}
        tabSlot={tabStrip}
        onClose={props.onClose}
      />
    );
  }

  return (
    <ContextScreen
      key={tab}
      memory={memoryByTab[tab]}
      labels={labelsByTab[tab]}
      tabSlot={tabStrip}
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
 * Header-left tab strip switching between the project, global, instructions,
 * and skills editors.
 * @param props - Tab strip props
 * @returns Tab strip element
 */
function TabStrip(props: TabStripProps): preact.JSX.Element {
  const { tab, onSelect } = props;

  return (
    <div
      role="tablist"
      aria-label="Context editor tabs"
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
      <TabButton
        label="Instructions"
        active={tab === "instructions"}
        onSelect={() => onSelect("instructions")}
      />
      <TabButton
        label="Skills"
        active={tab === "skills"}
        onSelect={() => onSelect("skills")}
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
