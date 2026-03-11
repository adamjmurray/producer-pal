// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { CHAT_UI_DOCS_URL, getModelName } from "#webui/lib/config";
import { type Provider } from "#webui/types/settings";
import { getProviderName } from "./header-helpers";
import { SettingsIcon } from "./HeaderIcons";
import { SmallModelIndicator } from "./SmallModelIndicator";
import { ToolsIndicator } from "./ToolsIndicator";

const iconBtn =
  "p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition-colors";

const helpBtn =
  "inline-flex items-center justify-center w-5 h-5 text-xs font-semibold leading-none rounded-full border border-zinc-400 dark:border-zinc-500 text-zinc-500 dark:text-zinc-400 hover:border-zinc-200 hover:text-white dark:hover:border-zinc-300 dark:hover:text-white no-underline shrink-0";

export interface HeaderActionsProps {
  activeModel: string | null;
  activeProvider: Provider | null;
  model: string;
  provider: Provider;
  enabledToolsCount: number;
  totalToolsCount: number;
  smallModelMode: boolean;
  defaultSmallModelMode: boolean;
  showHelpLinks: boolean;
  onOpenSettings: () => void;
  onOpenToolsSettings: () => void;
  onOpenConnectionSettings: () => void;
}

/**
 * Right-side header actions: model display, tool/small-model indicators, settings, help
 * @param props - HeaderActionsProps
 * @param props.activeModel - Active model identifier
 * @param props.activeProvider - Active provider
 * @param props.model - Configured model
 * @param props.provider - Configured provider
 * @param props.enabledToolsCount - Number of enabled tools
 * @param props.totalToolsCount - Total number of available tools
 * @param props.smallModelMode - Whether small model mode is active for this conversation
 * @param props.defaultSmallModelMode - Current default small model mode from settings
 * @param props.showHelpLinks - Whether to show help link buttons
 * @param props.onOpenSettings - Callback to open settings
 * @param props.onOpenToolsSettings - Callback to open tools settings tab
 * @param props.onOpenConnectionSettings - Callback to open connection settings tab
 * @returns Header actions element
 */
export function HeaderActions({
  activeModel,
  activeProvider,
  model,
  provider,
  enabledToolsCount,
  totalToolsCount,
  smallModelMode,
  defaultSmallModelMode,
  showHelpLinks,
  onOpenSettings,
  onOpenToolsSettings,
  onOpenConnectionSettings,
}: HeaderActionsProps) {
  const modelDiverges =
    activeModel != null &&
    (activeModel !== model || activeProvider !== provider);
  const smallModelDiverges =
    activeModel != null && smallModelMode !== defaultSmallModelMode;

  const modelColor = modelDiverges
    ? "text-amber-600 dark:text-amber-400"
    : "text-zinc-500 dark:text-zinc-400";
  const modelTitle = modelDiverges
    ? `Locked: ${getProviderName(activeProvider ?? provider)} | ${getModelName(activeModel)} (default is now ${getProviderName(provider)} | ${getModelName(model)})`
    : "Connection settings";

  return (
    <div className="ml-auto flex gap-2 sm:gap-3 items-center">
      <button
        type="button"
        onClick={onOpenConnectionSettings}
        className={`text-xs ${modelColor} whitespace-nowrap truncate min-w-0 max-w-28 sm:max-w-48 md:max-w-none hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer`}
        title={modelTitle}
      >
        <span className="hidden sm:inline">
          {getProviderName(activeProvider ?? provider)} |{" "}
        </span>
        {getModelName(activeModel ?? model)}
      </button>

      <button
        type="button"
        onClick={onOpenToolsSettings}
        className="hover:opacity-70 transition-opacity cursor-pointer"
        title="Tools settings"
      >
        <ToolsIndicator
          enabledToolsCount={enabledToolsCount}
          totalToolsCount={totalToolsCount}
        />
      </button>

      <button
        type="button"
        onClick={onOpenConnectionSettings}
        className="hover:opacity-70 transition-opacity cursor-pointer"
        title="Connection settings"
      >
        <SmallModelIndicator
          active={smallModelMode}
          diverges={smallModelDiverges}
        />
      </button>

      <button
        onClick={onOpenSettings}
        className={iconBtn}
        aria-label="Settings"
        title="Settings"
      >
        <SettingsIcon />
      </button>
      {showHelpLinks && (
        <a
          href={CHAT_UI_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={helpBtn}
          title="Documentation"
        >
          ?
        </a>
      )}
    </div>
  );
}
