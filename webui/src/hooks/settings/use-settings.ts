// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { type Provider, type UseSettingsReturn } from "#webui/types/settings";
import {
  buildAllProviderSettings,
  checkHasApiKey,
  DEFAULT_SETTINGS,
  loadAllProviderSettings,
  loadCurrentProvider,
  loadEnabledTools,
  loadProviderSettings,
  loadSmallModelMode,
  type ProviderSettings,
  saveCurrentSettings,
  saveSmallModelMode,
} from "./settings-helpers";
import { useVoiceModeSettings } from "./use-voice-mode-settings";

type ProviderStateSetters = Record<
  Provider,
  (update: (prev: ProviderSettings) => ProviderSettings) => void
>;

/**
 * Create a setter function for a specific provider setting
 *
 * @param {Provider} provider - The provider to update
 * @param {ProviderStateSetters} setters - Map of provider state setters
 * @param {K} key - The setting key to update
 * @returns {(value: ProviderSettings[K]) => void} Setter function
 */
function createProviderSetter<K extends keyof ProviderSettings>(
  provider: Provider,
  setters: ProviderStateSetters,
  key: K,
) {
  return (value: ProviderSettings[K]) => {
    setters[provider]((prev) => ({ ...prev, [key]: value }));
  };
}

// Hook manages state for 8 providers with individual setters and orchestration logic

/**
 * Hook for managing chat provider settings and tool enablement
 *
 * @returns {UseSettingsReturn} Settings state and management functions
 */
export function useSettings(): UseSettingsReturn {
  const [provider, setProviderState] = useState<Provider>(loadCurrentProvider);
  // `model` (returned below) is the in-modal value: changing it mid-edit
  // doesn't switch app modes. `savedModel` only updates on saveSettings and is
  // what App.tsx routes on — that way picking a realtime model in the provider
  // dropdown doesn't briefly mount VoiceApp behind the modal and trigger a
  // foreign-record bounce.
  const [savedModel, setSavedModel] = useState<string>(
    () => loadProviderSettings(loadCurrentProvider()).model,
  );
  // Save-buffered companion to `savedModel`. `provider` applies immediately, but
  // voice routing must pair the saved model with the saved provider, so this
  // lags `provider` until saveSettings (mirrors the savedModel rationale above).
  const [savedProvider, setSavedProvider] =
    useState<Provider>(loadCurrentProvider);
  // Save-buffered snapshot of `thinking` (per-provider, like `model`). The live
  // voice session reads this at connect time so an in-modal thinking edit
  // doesn't leak into the active RealtimeAgent's reasoning.effort — it applies
  // on the next Stop → Talk, matching the other saved* voice settings.
  const [savedThinking, setSavedThinking] = useState<string>(
    () => loadProviderSettings(loadCurrentProvider()).thinking,
  );
  const [settingsConfigured, setSettingsConfigured] = useState<boolean>(
    () => localStorage.getItem("producer_pal_settings_configured") === "true",
  );
  const [enabledTools, setEnabledToolsState] =
    useState<Record<string, boolean>>(loadEnabledTools);
  const [smallModelMode, setSmallModelModeState] =
    useState<boolean>(loadSmallModelMode);
  // Modal-local mirror of server config.liveApiEnabled. Synced from
  // useRemoteConfig in App.tsx; not persisted to localStorage because the
  // device Setup-tab toggle can change the value out from under us.
  // The dirty flag is set only by user-driven toggles (setLiveApiEnabled);
  // sync-from-server uses seedLiveApiEnabled and leaves it false.
  const [liveApiEnabled, setLiveApiEnabledState] = useState<boolean>(false);
  const [liveApiEnabledDirty, setLiveApiEnabledDirty] =
    useState<boolean>(false);
  // In-modal voice settings vs. persisted/applied values. Same split as
  // `model`/`savedModel` — saveSettings/cancelSettings synchronize them, but
  // the live voice session reads the `saved*` snapshots so mid-edit changes
  // don't leak into the active RealtimeAgent.
  const voiceModeSettings = useVoiceModeSettings();

  const setLiveApiEnabled = useCallback((enabled: boolean) => {
    setLiveApiEnabledState(enabled);
    setLiveApiEnabledDirty(true);
  }, []);

  const seedLiveApiEnabled = useCallback((enabled: boolean) => {
    setLiveApiEnabledState(enabled);
    setLiveApiEnabledDirty(false);
  }, []);
  const [anthropicSettings, setAnthropicSettings] = useState<ProviderSettings>(
    () => loadProviderSettings("anthropic"),
  );
  const [geminiSettings, setGeminiSettings] = useState<ProviderSettings>(() =>
    loadProviderSettings("gemini"),
  );
  const [openaiSettings, setOpenaiSettings] = useState<ProviderSettings>(() =>
    loadProviderSettings("openai"),
  );
  const [mistralSettings, setMistralSettings] = useState<ProviderSettings>(() =>
    loadProviderSettings("mistral"),
  );
  const [openrouterSettings, setOpenrouterSettings] =
    useState<ProviderSettings>(() => loadProviderSettings("openrouter"));
  const [lmstudioSettings, setLmstudioSettings] = useState<ProviderSettings>(
    () => loadProviderSettings("lmstudio"),
  );
  const [ollamaSettings, setOllamaSettings] = useState<ProviderSettings>(() =>
    loadProviderSettings("ollama"),
  );
  const [customSettings, setCustomSettings] = useState<ProviderSettings>(() =>
    loadProviderSettings("custom"),
  );

  // Mapping of providers to their state setters
  const providerStateSetters: ProviderStateSetters = useMemo(
    () => ({
      anthropic: setAnthropicSettings,
      gemini: setGeminiSettings,
      openai: setOpenaiSettings,
      mistral: setMistralSettings,
      openrouter: setOpenrouterSettings,
      lmstudio: setLmstudioSettings,
      ollama: setOllamaSettings,
      custom: setCustomSettings,
    }),
    [],
  );

  const currentSettings = {
    anthropic: anthropicSettings,
    gemini: geminiSettings,
    openai: openaiSettings,
    mistral: mistralSettings,
    openrouter: openrouterSettings,
    lmstudio: lmstudioSettings,
    ollama: ollamaSettings,
    custom: customSettings,
  }[provider];

  const applyLoadedSettings = useCallback(
    (allSettings: typeof DEFAULT_SETTINGS) => {
      setAnthropicSettings(allSettings.anthropic);
      setGeminiSettings(allSettings.gemini);
      setOpenaiSettings(allSettings.openai);
      setMistralSettings(allSettings.mistral);
      setOpenrouterSettings(allSettings.openrouter);
      setLmstudioSettings(allSettings.lmstudio);
      setOllamaSettings(allSettings.ollama);
      setCustomSettings(allSettings.custom);
    },
    [],
  );

  useEffect(() => {
    applyLoadedSettings(loadAllProviderSettings());
  }, [applyLoadedSettings]);

  const saveSettings = useCallback(() => {
    const allSettings = buildAllProviderSettings(
      anthropicSettings,
      geminiSettings,
      openaiSettings,
      mistralSettings,
      openrouterSettings,
      lmstudioSettings,
      ollamaSettings,
      customSettings,
    );

    saveCurrentSettings(provider, enabledTools, allSettings);
    saveSmallModelMode(smallModelMode);
    voiceModeSettings.commit();
    setSavedModel(allSettings[provider].model);
    setSavedProvider(provider);
    setSavedThinking(allSettings[provider].thinking);
    setSettingsConfigured(true);
    setLiveApiEnabledDirty(false);
  }, [
    provider,
    enabledTools,
    smallModelMode,
    voiceModeSettings,
    anthropicSettings,
    geminiSettings,
    openaiSettings,
    mistralSettings,
    openrouterSettings,
    lmstudioSettings,
    ollamaSettings,
    customSettings,
  ]);

  const cancelSettings = useCallback(() => {
    setProviderState(loadCurrentProvider());
    setEnabledToolsState(loadEnabledTools());
    setSmallModelModeState(loadSmallModelMode());
    voiceModeSettings.revert();
    applyLoadedSettings(loadAllProviderSettings());
    // Clear dirty so the next sync from server re-seeds local state
    // (the user-toggle-then-cancel case otherwise leaves a stale value).
    setLiveApiEnabledDirty(false);
  }, [applyLoadedSettings, voiceModeSettings]);

  // Individual setters that update the current provider's settings
  const setters = useMemo(() => {
    const createSetter =
      <K extends keyof ProviderSettings>(key: K) =>
      (value: ProviderSettings[K]) =>
        createProviderSetter(provider, providerStateSetters, key)(value);

    const hasBaseUrl =
      provider === "custom" || provider === "lmstudio" || provider === "ollama";

    return {
      setApiKey: createSetter("apiKey"),
      setModel: createSetter("model"),
      setBaseUrl: hasBaseUrl ? createSetter("baseUrl") : undefined,
      setThinking: createSetter("thinking"),
      setTemperature: createSetter("temperature"),
      setShowThoughts: createSetter("showThoughts"),
    };
  }, [provider, providerStateSetters]);
  const {
    setApiKey,
    setModel,
    setBaseUrl,
    setThinking,
    setTemperature,
    setShowThoughts,
  } = setters;
  const setProvider = useCallback((newProvider: Provider) => {
    setProviderState(newProvider);
  }, []);
  const hasApiKey = checkHasApiKey(provider);
  const isToolEnabled = useCallback(
    (toolId: string) => enabledTools[toolId] ?? true,
    [enabledTools],
  );
  const resetBehaviorToDefaults = useCallback(() => {
    setTemperature(1.0);
    setThinking(DEFAULT_SETTINGS[provider].thinking);
    setShowThoughts(true);
  }, [provider, setTemperature, setThinking, setShowThoughts]);
  const hasBaseUrl =
    provider === "custom" || provider === "lmstudio" || provider === "ollama";

  return {
    provider,
    setProvider,
    apiKey: currentSettings.apiKey,
    setApiKey,
    baseUrl: hasBaseUrl ? currentSettings.baseUrl : undefined,
    setBaseUrl: hasBaseUrl ? setBaseUrl : undefined,
    model: currentSettings.model,
    setModel,
    savedModel,
    savedProvider,
    thinking: currentSettings.thinking,
    setThinking,
    savedThinking,
    temperature: currentSettings.temperature,
    setTemperature,
    showThoughts: currentSettings.showThoughts,
    setShowThoughts,
    saveSettings,
    cancelSettings,
    hasApiKey,
    settingsConfigured,
    enabledTools,
    setEnabledTools: setEnabledToolsState,
    resetBehaviorToDefaults,
    isToolEnabled,
    smallModelMode,
    setSmallModelMode: setSmallModelModeState,
    liveApiEnabled,
    liveApiEnabledDirty,
    setLiveApiEnabled,
    seedLiveApiEnabled,
    realtimeVoice: voiceModeSettings.realtimeVoice,
    setRealtimeVoice: voiceModeSettings.setRealtimeVoice,
    savedRealtimeVoice: voiceModeSettings.savedRealtimeVoice,
    voiceSpeed: voiceModeSettings.voiceSpeed,
    setVoiceSpeed: voiceModeSettings.setVoiceSpeed,
    savedVoiceSpeed: voiceModeSettings.savedVoiceSpeed,
    voiceVolume: voiceModeSettings.voiceVolume,
    setVoiceVolume: voiceModeSettings.setVoiceVolume,
    turnDetection: voiceModeSettings.turnDetection,
    setTurnDetection: voiceModeSettings.setTurnDetection,
    savedTurnDetection: voiceModeSettings.savedTurnDetection,
  };
}
