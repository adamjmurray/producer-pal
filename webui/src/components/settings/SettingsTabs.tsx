// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { type VNode } from "preact";

export type TabId = "connection" | "behavior" | "tools" | "appearance";

interface Tab {
  id: TabId;
  label: string;
}

interface SettingsTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  children: (activeTab: TabId) => VNode;
}

const tabs: Tab[] = [
  { id: "connection", label: "Connection" },
  { id: "behavior", label: "Behavior" },
  { id: "tools", label: "Tools" },
  { id: "appearance", label: "Appearance" },
];

/**
 * Tabbed navigation for settings sections
 * @param {SettingsTabsProps} props - Component props
 * @param {TabId} props.activeTab - Currently active tab
 * @param {(tab: TabId) => void} props.onTabChange - Callback when tab changes
 * @param {(activeTab: TabId) => VNode} props.children - Render function for tab content
 * @returns {JSX.Element} - React component
 */
export function SettingsTabs({
  activeTab,
  onTabChange,
  children,
}: SettingsTabsProps) {
  return (
    <div>
      {/* Tab buttons */}
      <div className="flex overflow-x-auto border-b border-zinc-300 dark:border-zinc-600 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`shrink-0 px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === tab.id
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>{children(activeTab)}</div>
    </div>
  );
}
