// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { type Provider, type UseSettingsReturn } from "#webui/types/settings";
import {
  type AllProviderSettings,
  buildAllProviderSettings,
  checkHasApiKey,
  DEFAULT_SETTINGS,
  loadAllProviderSettingsAsync,
  loadCurrentProvider,
  loadEnabledTools,
  loadProviderSettings,
  loadSmallModelMode,
  type ProviderSettings,
  type ProviderSettingsApplier,
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
  // False until the post-mount async decrypt has applied the real apiKeys.
  // saveSettings gates on this — saving the placeholder blanks would wipe
  // every stored encrypted key.
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false);
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
      for (const p of Object.keys(allSettings) as Provider[]) {
        providerStateSetters[p](() => allSettings[p]);
      }
    },
    [providerStateSetters],
  );

  // Post-mount: replace the synchronous placeholder settings (apiKey blanked)
  // with the real values, decrypting each provider's apiKey from its at-rest
  // envelope. Runs once; the synchronous useState initializers above already
  // populated everything except the (async-decrypted) apiKey.
  useEffect(
    () =>
      applyDecryptedSettings(applyLoadedSettings, () =>
        setSettingsLoaded(true),
      ),
    [applyLoadedSettings],
  );

  const saveSettings = useCallback(async (): Promise<void> => {
    if (!warnIfNotLoaded(settingsLoaded)) return;

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

    // Update saved* snapshots and configured flag synchronously so the modal
    // close + downstream routing reflect the user's choice immediately. The
    // encryption write is awaited last so the returned promise resolves only
    // after the at-rest envelope lands — callers (e.g. use-save-settings-handler)
    // gate post-save RPCs on this, so "Save" really means "saved" by the time
    // the modal close animation runs and the RPCs fire.
    voiceModeSettings.commit();
    setSavedModel(allSettings[provider].model);
    setSavedProvider(provider);
    setSavedThinking(allSettings[provider].thinking);
    setSettingsConfigured(true);
    setLiveApiEnabledDirty(false);
    await persistAllSettings(
      provider,
      enabledTools,
      allSettings,
      smallModelMode,
    );
  }, [
    settingsLoaded,
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
    // Re-decrypt and restore saved provider settings (async; the apiKey lands a
    // tick later, mirroring the post-mount load). Pass the same onLoaded as the
    // post-mount effect so a cancel-during-initial-load (StrictMode remount,
    // fast cancel-then-reopen) still settles settingsLoaded → true — otherwise
    // the next Save would silently no-op via warnIfNotLoaded.
    applyDecryptedSettings(applyLoadedSettings, () => setSettingsLoaded(true));
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
  // Reconcile presence with the *decrypted* in-memory key. decryptApiKey fails
  // safe to "" for an orphaned/undecryptable envelope (e.g. the IndexedDB crypto
  // key was reset while the localStorage envelope persisted), so reading the raw
  // stored envelope would falsely report a usable key. currentSettings.apiKey is
  // the decrypted value (blank until the post-mount load lands), so it matches
  // what requests will actually send. lmstudio/ollama need no key — keep their
  // "configured at all" signal via checkHasApiKey.
  const hasApiKey =
    provider === "lmstudio" || provider === "ollama"
      ? checkHasApiKey(provider)
      : Boolean(currentSettings.apiKey);
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

/**
 * Gate save until the post-mount decrypt has applied real apiKeys. Returns
 * false (and logs) when still loading so the caller can bail before persisting
 * blank placeholders that would overwrite stored encrypted keys.
 * @param {boolean} settingsLoaded - True once decrypted settings have been applied
 * @returns {boolean} True when save may proceed
 */
function warnIfNotLoaded(settingsLoaded: boolean): boolean {
  if (settingsLoaded) return true;
  console.warn(
    "Settings not yet loaded; ignoring save to avoid wiping stored apiKeys",
  );

  return false;
}

/**
 * Persist encrypted provider settings and the small-model-mode flag. Save is
 * user-triggered and the apiKey encryption is async, so we fire-and-forget and
 * log on failure rather than throwing into render.
 * @param {Provider} provider - Currently selected provider
 * @param {Record<string, boolean>} enabledTools - Tool enabled states
 * @param {AllProviderSettings} allSettings - Settings for every provider
 * @param {boolean} smallModelMode - Small-model-mode flag
 */
async function persistAllSettings(
  provider: Provider,
  enabledTools: Record<string, boolean>,
  allSettings: AllProviderSettings,
  smallModelMode: boolean,
): Promise<void> {
  saveSmallModelMode(smallModelMode);

  try {
    await saveCurrentSettings(provider, enabledTools, allSettings);
  } catch (err) {
    console.error("Failed to save provider settings", err);
  }
}

/**
 * Load and decrypt all provider settings, then apply them via the given setter.
 * Returns a cleanup callback (for useEffect) that ignores a late-arriving load
 * after unmount. Errors are logged, never thrown into render.
 * @param {ProviderSettingsApplier} apply - Setter that writes loaded settings to state
 * @param {() => void} onLoaded - Called after the load settles (success OR failure), skipped on unmount. Unlocks save even when decryption is broken (e.g., IndexedDB key reset) so the user can recover by typing fresh keys.
 * @returns {() => void} Cleanup that cancels a pending apply
 */
function applyDecryptedSettings(
  apply: ProviderSettingsApplier,
  onLoaded?: () => void,
): () => void {
  let cancelled = false;

  loadAllProviderSettingsAsync()
    .then((loaded) => {
      if (cancelled) return;
      apply(loaded);
      onLoaded?.();
    })
    .catch((err: unknown) => {
      console.error("Failed to load provider settings", err);
      if (!cancelled) onLoaded?.();
    });

  return () => {
    cancelled = true;
  };
}
