// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type VNode } from "preact";
import { type TabId } from "./helpers/settings-tab-ids";

interface Tab {
  id: TabId;
  label: string;
}

interface SettingsTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  /** Tabs that get an attention dot. */
  attention?: readonly TabId[];
  children: (activeTab: TabId) => VNode;
}

const tabs: Tab[] = [
  { id: "connection", label: "Connection" },
  { id: "presets", label: "Presets" },
  { id: "tools", label: "Tools" },
  { id: "installation", label: "Installation" },
  { id: "preferences", label: "Preferences" },
];

/**
 * Tabbed navigation for settings sections
 * @param {SettingsTabsProps} props - Component props
 * @param {TabId} props.activeTab - Currently active tab
 * @param {(tab: TabId) => void} props.onTabChange - Callback when tab changes
 * @param {readonly TabId[]} [props.attention] - Tabs that get an attention dot
 * @param {(activeTab: TabId) => VNode} props.children - Render function for tab content
 * @returns {JSX.Element} - React component
 */
export function SettingsTabs({
  activeTab,
  onTabChange,
  attention = [],
  children,
}: SettingsTabsProps) {
  return (
    <div>
      {/* Tab buttons */}
      <div className="mb-6 flex overflow-x-auto border-b border-zinc-300 dark:border-zinc-600">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
            {attention.includes(tab.id) && (
              <span
                role="img"
                aria-label="needs attention"
                className="size-[7px] rounded-full bg-amber-500 dark:bg-amber-400"
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>{children(activeTab)}</div>
    </div>
  );
}
