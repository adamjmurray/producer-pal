// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { getProviderName } from "#webui/components/chat/controls/header/header-helpers";
import { getModelName } from "#webui/lib/config";
import { type Provider } from "#webui/types/settings";

interface LockedSettingsNoticeProps {
  activeModel: string | null;
  activeProvider: Provider | null;
  model: string;
  provider: Provider;
}

/**
 * Notice shown in settings when locked conversation settings diverge from defaults.
 * Only renders when the active conversation's model/provider differs from current settings.
 * @param props - Component props
 * @param props.activeModel - Locked model for the active conversation
 * @param props.activeProvider - Locked provider for the active conversation
 * @param props.model - Current default model from settings
 * @param props.provider - Current default provider from settings
 * @returns Notice element or null
 */
export function LockedSettingsNotice({
  activeModel,
  activeProvider,
  model,
  provider,
}: LockedSettingsNoticeProps) {
  if (activeModel == null) return null;

  const diverges = activeModel !== model || activeProvider !== provider;

  if (!diverges) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
      <p>Changes apply to new conversations only.</p>
      <p className="mt-1 text-xs opacity-80">
        Current conversation uses {getProviderName(activeProvider ?? provider)}{" "}
        | {getModelName(activeModel)}
      </p>
    </div>
  );
}
