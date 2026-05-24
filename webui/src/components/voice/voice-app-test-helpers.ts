// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { vi } from "vitest";
import { type VoiceAppProps } from "#webui/components/voice/VoiceApp";
import { type UseSettingsReturn } from "#webui/types/settings";

export interface PropOverrides {
  apiKey?: string;
  provider?: "openai" | "anthropic";
  onOpenSettings?: () => void;
  savedRealtimeVoice?: string;
}

/**
 * Build a full VoiceAppProps bag with sensible defaults for VoiceApp tests.
 * vi.fn() returns a Mock with a Constructable signature that TS refuses to
 * assign to a plain `() => void`, so the result is cast to VoiceAppProps.
 *
 * @param o - Per-test overrides
 * @returns VoiceAppProps ready to spread onto <VoiceApp />
 */
export function makeProps(o: PropOverrides = {}): VoiceAppProps {
  const apiKey = o.apiKey ?? "sk-test";
  const provider = o.provider ?? "openai";

  return {
    settings: {
      provider,
      savedProvider: provider,
      apiKey,
      model: "gpt-realtime-2",
      savedModel: "gpt-realtime-2",
      enabledTools: {},
      savedRealtimeVoice: o.savedRealtimeVoice ?? "marin",
    } as unknown as UseSettingsReturn,
    display: {
      showTimestamps: false,
      showHelpLinks: false,
      showTokenUsage: false,
      setShowTimestamps: vi.fn(),
      setShowHelpLinks: vi.fn(),
      setShowTokenUsage: vi.fn(),
    },
    viewState: {
      historyPanelOpen: false,
      settingsOpen: false,
      settingsTab: "connection",
    },
    setViewState: vi.fn(),
    mcpStatus: "connected",
    totalToolsCount: 2,
    enabledToolsCount: 2,
    onOpenSettings: o.onOpenSettings ?? vi.fn(),
    onOpenToolsSettings: vi.fn(),
    onOpenConnectionSettings: vi.fn(),
    onForeignRecord: vi.fn(),
    clearViewingMode: vi.fn(),
    setModeContext: vi.fn(),
  } as unknown as VoiceAppProps;
}
