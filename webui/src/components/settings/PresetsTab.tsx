// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type UseSettingsReturn } from "#webui/types/settings";
import { PresetControls } from "./PresetControls";

interface PresetsTabProps {
  settings: UseSettingsReturn;
}

/**
 * Presets tab: a preset's dedicated home. A preset bundles everything a chat
 * session runs with — provider, model, inference, and toolset — cutting across
 * the Connection and Tools tabs so it lives here rather than crowding either.
 * API keys and UI preferences are never part of a preset.
 * @param {PresetsTabProps} props - Component props
 * @param {UseSettingsReturn} props.settings - The live settings buffer + actions
 * @returns {JSX.Element} The Presets tab
 */
export function PresetsTab({ settings }: PresetsTabProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-300">
        A preset saves and recalls a full chat setup — provider, model,
        thinking, small-model mode, and the enabled toolset — in one click. Set
        those up on the Connection and Tools tabs, then save them here as a
        named preset. API keys and appearance preferences are never included.
      </p>
      <PresetControls settings={settings} />
    </div>
  );
}
