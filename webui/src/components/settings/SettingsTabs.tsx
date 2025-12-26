import type { VNode } from "preact";
import { useState } from "preact/hooks";

export type TabId = "connection" | "behavior" | "tools" | "appearance";

interface Tab {
  id: TabId;
  label: string;
}

interface SettingsTabsProps {
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
 * @param {(activeTab: TabId) => VNode} props.children - Render function for tab content
 * @returns {JSX.Element} - React component
 */
export function SettingsTabs({ children }: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("connection");

  return (
    <div>
      {/* Tab buttons */}
      <div className="flex border-b border-gray-300 dark:border-gray-600 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === tab.id
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
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
