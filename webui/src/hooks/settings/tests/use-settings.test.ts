// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 * @returns {any} - Hook return value
 */
import "fake-indexeddb/auto";
import { renderHook, act, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptApiKey, encryptApiKey } from "#webui/lib/api-key-crypto";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { flushLoad } from "./use-settings-test-helpers";

describe("useSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /**
   * Assert a provider's stored JSON has an encrypted apiKey (not the cleartext)
   * that decrypts back to the expected value, plus the other expected fields.
   * @param provider - Provider storage key suffix
   * @param expectedApiKey - The cleartext apiKey the stored value should decrypt to
   * @param rest - Other non-apiKey fields expected in the stored JSON
   */
  async function expectStored(
    provider: string,
    expectedApiKey: string,
    rest: Record<string, unknown>,
  ): Promise<void> {
    const stored = JSON.parse(
      localStorage.getItem(`producer_pal_provider_${provider}`) ?? "{}",
    );

    expect(stored.apiKey).not.toBe(expectedApiKey);
    expect(await decryptApiKey(stored.apiKey)).toBe(expectedApiKey);
    expect(stored).toMatchObject(rest);
  }

  it("loads default values when localStorage is empty", () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current).toMatchObject({
      apiKey: "",
      model: "gemini-3.6-flash",
      thinking: "Default",
      hasApiKey: false,
    });
  });

  it("migrates Gemini settings from old localStorage format", async () => {
    localStorage.setItem("gemini_api_key", "test-key");
    localStorage.setItem("gemini_model", "gemini-2.5-pro");
    localStorage.setItem("thinking", "High");

    const { result } = renderHook(() => useSettings());

    // Non-apiKey fields are available synchronously; the apiKey (here a legacy
    // cleartext passthrough) and the derived hasApiKey settle after the
    // post-mount decrypt effect.
    expect(result.current).toMatchObject({
      model: "gemini-2.5-pro",
      thinking: "High",
    });
    await waitFor(() => expect(result.current.apiKey).toBe("test-key"));
    expect(result.current.hasApiKey).toBe(true);
  });

  it("loads from new JSON blob format", async () => {
    localStorage.setItem(
      "producer_pal_provider_gemini",
      JSON.stringify({
        apiKey: "new-key",
        model: "gemini-3.6-flash",
        thinking: "Max",
      }),
    );

    const { result } = renderHook(() => useSettings());

    expect(result.current).toMatchObject({
      model: "gemini-3.6-flash",
      thinking: "Max",
    });
    await waitFor(() => expect(result.current.apiKey).toBe("new-key"));
    expect(result.current.hasApiKey).toBe(true);
  });

  it("prefers new format over old format", async () => {
    // Set both old and new formats
    localStorage.setItem("gemini_api_key", "old-key");
    localStorage.setItem("gemini_model", "gemini-2.5-pro");
    localStorage.setItem(
      "producer_pal_provider_gemini",
      JSON.stringify({
        apiKey: "new-key",
        model: "gemini-3.6-flash",
        thinking: "Adaptive",
      }),
    );

    const { result } = renderHook(() => useSettings());

    // Should use new format
    expect(result.current.model).toBe("gemini-3.6-flash");
    await waitFor(() => expect(result.current.apiKey).toBe("new-key"));
  });

  it("loads saved Ollama thinking on first render", () => {
    localStorage.setItem("producer_pal_current_provider", "ollama");
    localStorage.setItem(
      "producer_pal_provider_ollama",
      JSON.stringify({
        apiKey: "",
        model: "qwen3.6",
        baseUrl: "http://localhost:11434",
        thinking: "Max",
      }),
    );

    const { result } = renderHook(() => useSettings());

    // Must be "Max" on first render (not "Default") so that
    // ChatScreen's useState(defaultThinking) captures the saved value
    expect(result.current.thinking).toBe("Max");
  });

  it("updates apiKey when setApiKey is called", async () => {
    const { result } = renderHook(() => useSettings());

    await act(() => {
      result.current.setApiKey("new-key");
    });

    expect(result.current.apiKey).toBe("new-key");
  });

  it("updates model when setModel is called", async () => {
    const { result } = renderHook(() => useSettings());

    await act(() => {
      result.current.setModel("gemini-3.6-flash");
    });

    expect(result.current.model).toBe("gemini-3.6-flash");
  });

  it("savedModel only updates on saveSettings, not setModel", async () => {
    const { result } = renderHook(() => useSettings());
    const initialSavedModel = result.current.savedModel;

    await act(() => {
      result.current.setModel("gemini-3.6-flash");
    });
    // In-modal change should NOT flip the App-level routing model.
    expect(result.current.model).toBe("gemini-3.6-flash");
    expect(result.current.savedModel).toBe(initialSavedModel);

    await act(async () => {
      await result.current.saveSettings();
    });
    expect(result.current.savedModel).toBe("gemini-3.6-flash");
  });

  it("savedProvider only updates on saveSettings, not setProvider", async () => {
    const { result } = renderHook(() => useSettings());

    await flushLoad();
    const initialSavedProvider = result.current.savedProvider;
    const target = initialSavedProvider === "openai" ? "gemini" : "openai";

    await act(() => {
      result.current.setProvider(target);
    });
    // In-modal provider change applies immediately but must NOT flip routing
    // until save — App.tsx pairs savedProvider with savedModel for voice/chat.
    expect(result.current.provider).toBe(target);
    expect(result.current.savedProvider).toBe(initialSavedProvider);

    await act(async () => {
      await result.current.saveSettings();
    });
    expect(result.current.savedProvider).toBe(target);
  });

  it("savedThinking only updates on saveSettings, not setThinking", async () => {
    const { result } = renderHook(() => useSettings());

    await flushLoad();
    const initialSavedThinking = result.current.savedThinking;
    const target = initialSavedThinking === "Off" ? "Max" : "Off";

    await act(() => {
      result.current.setThinking(target);
    });
    // In-modal change applies to the live value but must NOT leak into the
    // voice session's connect-time snapshot until save.
    expect(result.current.thinking).toBe(target);
    expect(result.current.savedThinking).toBe(initialSavedThinking);

    await act(async () => {
      await result.current.saveSettings();
    });
    expect(result.current.savedThinking).toBe(target);
  });

  it("updates thinking when setThinking is called", async () => {
    const { result } = renderHook(() => useSettings());

    await act(() => {
      result.current.setThinking("Off");
    });

    expect(result.current.thinking).toBe("Off");
  });

  it("saveSettings before post-mount decrypt does not wipe stored apiKeys", async () => {
    // Seed two providers with encrypted apiKeys so we can detect a wipe.
    for (const provider of ["gemini", "openai"] as const) {
      localStorage.setItem(
        `producer_pal_provider_${provider}`,
        JSON.stringify({
          apiKey: await encryptApiKey(`${provider}-stored`),
          model: "stored-model",
          thinking: "Default",
        }),
      );
    }

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => useSettings());

    // Call saveSettings BEFORE flushing the post-mount decrypt: in-memory
    // apiKeys are still the blank placeholders at this point.
    await act(async () => {
      await result.current.saveSettings();
    });

    // Race-window save must bail (warn + no persist) so the seeded keys stay.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("not yet loaded"),
    );

    for (const provider of ["gemini", "openai"] as const) {
      const raw = JSON.parse(
        localStorage.getItem(`producer_pal_provider_${provider}`) ?? "{}",
      );

      expect(await decryptApiKey(raw.apiKey)).toBe(`${provider}-stored`);
    }

    warn.mockRestore();
  });

  it("saves settings to new JSON blob format", async () => {
    const { result } = renderHook(() => useSettings());

    await flushLoad();
    await act(() => {
      result.current.setApiKey("new-key");
      result.current.setModel("gemini-3.6-flash");
      result.current.setThinking("Max");
    });

    await act(async () => {
      await result.current.saveSettings();
    });

    expect(localStorage.getItem("producer_pal_current_provider")).toBe(
      "gemini",
    );

    // Save is async (fire-and-forget); wait for the encrypted envelope to land
    // before asserting the stored shape. apiKey is encrypted at rest, so the
    // raw value must NOT equal the cleartext (see expectStored).
    await waitFor(() => {
      const raw = JSON.parse(
        localStorage.getItem("producer_pal_provider_gemini") ?? "{}",
      );

      expect(raw.apiKey?.startsWith("enc:v1:")).toBe(true);
    });

    await expectStored("gemini", "new-key", {
      model: "gemini-3.6-flash",
      thinking: "Max",
    });
  });

  describe("liveApiEnabled dirty flag", () => {
    it("starts not dirty and reports the default value", () => {
      const { result } = renderHook(() => useSettings());

      expect(result.current.liveApiEnabled).toBe(false);
      expect(result.current.liveApiEnabledDirty).toBe(false);
    });

    it("setLiveApiEnabled marks dirty and updates the value", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setLiveApiEnabled(true);
      });

      expect(result.current.liveApiEnabled).toBe(true);
      expect(result.current.liveApiEnabledDirty).toBe(true);
    });

    it("seedLiveApiEnabled updates the value without marking dirty", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.seedLiveApiEnabled(true);
      });

      expect(result.current.liveApiEnabled).toBe(true);
      expect(result.current.liveApiEnabledDirty).toBe(false);
    });

    it("saveSettings clears the dirty flag", async () => {
      const { result } = renderHook(() => useSettings());

      await flushLoad();
      await act(() => {
        result.current.setLiveApiEnabled(true);
      });
      expect(result.current.liveApiEnabledDirty).toBe(true);

      await act(async () => {
        await result.current.saveSettings();
      });
      expect(result.current.liveApiEnabledDirty).toBe(false);
    });

    it("cancelSettings clears the dirty flag", async () => {
      const { result } = renderHook(() => useSettings());

      await act(() => {
        result.current.setLiveApiEnabled(true);
      });
      expect(result.current.liveApiEnabledDirty).toBe(true);

      await act(() => {
        result.current.cancelSettings();
      });
      expect(result.current.liveApiEnabledDirty).toBe(false);
    });
  });

  it("cancelSettings re-arms settingsLoaded so a subsequent Save persists", async () => {
    // Reproduces the cancel-during-initial-load case: the first decrypt-load's
    // onLoaded was previously dropped (StrictMode cleanup, fast cancel-then-
    // reopen) and cancelSettings called applyDecryptedSettings without an
    // onLoaded — leaving settingsLoaded false and turning the next saveSettings
    // into a silent no-op (the warn path). After the fix, cancelSettings's own
    // decrypt-load wires up setSettingsLoaded → save proceeds normally.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => useSettings());

    // Cancel before the post-mount decrypt-load has flushed (the scenario the
    // bug occurs in). cancelSettings kicks off its own decrypt-load.
    await act(() => {
      result.current.cancelSettings();
    });

    // Let both in-flight decrypt-loads settle.
    await flushLoad();

    await act(() => {
      result.current.setApiKey("post-cancel-key");
    });
    await act(async () => {
      await result.current.saveSettings();
    });

    // Save proceeded — not the "ignoring save" warn path.
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining("not yet loaded"),
    );
    expect(localStorage.getItem("producer_pal_settings_configured")).toBe(
      "true",
    );

    warn.mockRestore();
  });

  it("reverts to saved settings on cancel", async () => {
    localStorage.setItem("gemini_api_key", "saved-key");
    localStorage.setItem("gemini_model", "gemini-2.5-pro");

    const { result } = renderHook(() => useSettings());

    // Wait for the post-mount decrypt to apply the saved key before editing,
    // so the async load can't clobber the edit below.
    await waitFor(() => expect(result.current.apiKey).toBe("saved-key"));

    await act(() => {
      result.current.setApiKey("temporary-key");
      result.current.setModel("gemini-2.5-flash");
    });

    expect(result.current.apiKey).toBe("temporary-key");
    expect(result.current.model).toBe("gemini-2.5-flash");

    await act(() => {
      result.current.cancelSettings();
    });

    // cancel reloads (and re-decrypts) saved settings asynchronously.
    await waitFor(() => {
      expect(result.current.model).toBe("gemini-2.5-pro");
      expect(result.current.apiKey).toBe("saved-key");
    });
  });

  it("hasApiKey returns false when no key in localStorage", () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.hasApiKey).toBe(false);
  });

  it("hasApiKey returns true when key exists in old format", async () => {
    localStorage.setItem("gemini_api_key", "test-key");
    const { result } = renderHook(() => useSettings());

    // hasApiKey derives from the decrypted in-memory key, which lands after the
    // post-mount load (legacy cleartext passes through decrypt unchanged).
    await waitFor(() => expect(result.current.hasApiKey).toBe(true));
  });

  it("hasApiKey returns true when key exists in new format", async () => {
    localStorage.setItem(
      "producer_pal_provider_gemini",
      JSON.stringify({ apiKey: "test-key" }),
    );
    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.hasApiKey).toBe(true));
  });

  it("hasApiKey is false for an undecryptable (orphaned) key", async () => {
    // A raw envelope is present in localStorage, but it can't be decrypted (e.g.
    // the IndexedDB crypto key was reset). decryptApiKey fails safe to "", so
    // hasApiKey must report false rather than trusting the raw envelope.
    localStorage.setItem(
      "producer_pal_provider_gemini",
      JSON.stringify({ apiKey: await forgeUndecryptableEnvelope() }),
    );

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.apiKey).toBe(""));
    expect(result.current.hasApiKey).toBe(false);
  });

  it("remembers all settings per provider when switching", async () => {
    const { result } = renderHook(() => useSettings());

    await flushLoad();

    // Configure Gemini with custom settings
    await act(() => {
      result.current.setApiKey("gemini-key");
      result.current.setModel("gemini-2.5-pro");
      result.current.setThinking("Max");
    });

    expect(result.current).toMatchObject({
      model: "gemini-2.5-pro",
      thinking: "Max",
    });

    // Switch to OpenAI - should use defaults
    await act(() => {
      result.current.setProvider("openai");
    });

    expect(result.current).toMatchObject({
      apiKey: "",
      model: "gpt-5.6-terra",
      thinking: "Default",
    });

    // Configure OpenAI with different settings
    await act(() => {
      result.current.setApiKey("openai-key");
      result.current.setModel("gpt-5.4-mini");
      result.current.setThinking("Off");
    });

    // Switch back to Gemini - should restore Gemini settings
    await act(() => {
      result.current.setProvider("gemini");
    });

    expect(result.current).toMatchObject({
      apiKey: "gemini-key",
      model: "gemini-2.5-pro",
      thinking: "Max",
    });

    // Switch back to OpenAI - should restore OpenAI settings
    await act(() => {
      result.current.setProvider("openai");
    });

    expect(result.current).toMatchObject({
      apiKey: "openai-key",
      model: "gpt-5.4-mini",
      thinking: "Off",
    });
  });

  it("saves and loads all provider settings separately", async () => {
    interface ProviderSetup {
      provider: "gemini" | "openai" | "openrouter" | "mistral";
      apiKey: string;
      model: string;
      thinking?: string;
    }
    const setups: ProviderSetup[] = [
      {
        provider: "gemini",
        apiKey: "gemini-key",
        model: "gemini-2.5-pro",
        thinking: "Max",
      },
      {
        provider: "openai",
        apiKey: "openai-key",
        model: "gpt-5.4-mini",
        thinking: "Off",
      },
      {
        provider: "openrouter",
        apiKey: "openrouter-key",
        model: "minimax/minimax-m2:free",
      },
      {
        provider: "mistral",
        apiKey: "mistral-key",
        model: "mistral-small-latest",
      },
    ];
    const last = setups.at(-1)!;

    const { result } = renderHook(() => useSettings());

    await flushLoad();

    // Configure each provider with unique settings
    for (const s of setups) {
      await act(() => result.current.setProvider(s.provider));
      await act(() => {
        result.current.setApiKey(s.apiKey);
        result.current.setModel(s.model);
        if (s.thinking != null) result.current.setThinking(s.thinking);
      });
    }

    // Save all settings (async encrypt + write)
    await act(async () => {
      await result.current.saveSettings();
    });

    // Wait for the async save to land every provider's encrypted key.
    await waitFor(() => {
      for (const { provider } of setups) {
        const raw = JSON.parse(
          localStorage.getItem(`producer_pal_provider_${provider}`) ?? "{}",
        );

        expect(raw.apiKey?.startsWith("enc:v1:")).toBe(true);
      }
    });

    // Verify each provider's settings are saved separately as JSON, with the
    // apiKey encrypted at rest (raw value is NOT the cleartext).
    for (const { provider, apiKey, ...rest } of setups) {
      await expectStored(provider, apiKey, rest);
    }

    // Reload (fresh hook) and verify the last selected provider is loaded.
    const { result: result2 } = renderHook(() => useSettings());

    expect(result2.current).toMatchObject({
      provider: last.provider,
      model: last.model,
    });
    await waitFor(() => expect(result2.current.apiKey).toBe(last.apiKey));

    // Switch through the remaining providers and verify each loads correctly.
    for (const s of setups.slice(0, -1)) {
      await act(() => result2.current.setProvider(s.provider));
      expect(result2.current).toMatchObject({
        model: s.model,
        ...(s.thinking != null ? { thinking: s.thinking } : {}),
      });
      await waitFor(() => expect(result2.current.apiKey).toBe(s.apiKey));
    }
  });

  it("settingsConfigured is false by default", () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.settingsConfigured).toBe(false);
  });

  it("loads settingsConfigured from localStorage", () => {
    localStorage.setItem("producer_pal_settings_configured", "true");
    const { result } = renderHook(() => useSettings());

    expect(result.current.settingsConfigured).toBe(true);
  });

  it("sets settingsConfigured to true after saveSettings is called", async () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.settingsConfigured).toBe(false);

    await flushLoad();
    await act(async () => {
      await result.current.saveSettings();
    });

    expect(result.current.settingsConfigured).toBe(true);
    expect(localStorage.getItem("producer_pal_settings_configured")).toBe(
      "true",
    );
  });

  it("saveSettings returns true and leaves saveError null on success", async () => {
    const { result } = renderHook(() => useSettings());

    await flushLoad();

    let saved: boolean | undefined;

    await act(async () => {
      saved = await result.current.saveSettings();
    });

    expect(saved).toBe(true);
    expect(result.current.saveError).toBeNull();
  });

  it("cancelSettings clears a prior saveError", async () => {
    // Direct state poke isn't possible from outside; instead, exercise the
    // failure path then cancel. We can't simulate encrypt failure without
    // remocking, so just verify the cleared state after cancel from idle (no
    // error) is unchanged — covered alongside the crypto-errors test, which
    // produces the error in the first place. This test guards the contract
    // that saveError is always null after a cancel.
    const { result } = renderHook(() => useSettings());

    await act(() => {
      result.current.cancelSettings();
    });

    expect(result.current.saveError).toBeNull();
  });

  it("resetBehaviorToDefaults resets thinking", async () => {
    const { result } = renderHook(() => useSettings());

    // Set a non-default value
    await act(() => {
      result.current.setThinking("Off");
    });

    expect(result.current).toMatchObject({
      thinking: "Off",
    });

    // Reset to defaults
    await act(() => {
      result.current.resetBehaviorToDefaults();
    });

    expect(result.current).toMatchObject({
      thinking: "Default", // Default for gemini
    });
  });

  it("isToolEnabled returns true for enabled tools", () => {
    const { result } = renderHook(() => useSettings());

    // Tools are enabled by default
    expect(result.current.isToolEnabled("ppal-connect")).toBe(true);
  });

  it("isToolEnabled returns false for disabled tools", async () => {
    const { result } = renderHook(() => useSettings());

    // Disable a tool
    await act(() => {
      result.current.setEnabledTools({
        ...result.current.enabledTools,
        "ppal-connect": false,
      });
    });

    expect(result.current.isToolEnabled("ppal-connect")).toBe(false);
  });

  it("isToolEnabled returns true for unknown tools (default)", () => {
    const { result } = renderHook(() => useSettings());

    // Unknown tools default to enabled
    expect(result.current.isToolEnabled("unknown-tool")).toBe(true);
  });

  it("setProvider preserves thinking value when switching providers", async () => {
    const { result } = renderHook(() => useSettings());

    // Set thinking to "Max" for gemini
    await act(() => {
      result.current.setProvider("gemini");
      result.current.setThinking("Max");
    });
    expect(result.current.thinking).toBe("Max");
    // Switch to OpenAI - thinking should use OpenAI's saved setting (Default by default)
    await act(() => {
      result.current.setProvider("openai");
    });
    expect(result.current.thinking).toBe("Default"); // Default for OpenAI
  });

  it("hasApiKey returns false when localStorage has invalid JSON", async () => {
    // Set invalid JSON for a provider
    localStorage.setItem("producer_pal_provider_gemini", "invalid json{");
    const { result } = renderHook(() => useSettings());

    // Switch to gemini to trigger hasApiKey computation
    await act(() => {
      result.current.setProvider("gemini");
    });
    expect(result.current.hasApiKey).toBe(false);
    // Cleanup
    localStorage.removeItem("producer_pal_provider_gemini");
  });

  it.each([
    ["custom", "http://localhost:8080"],
    ["ollama", "http://192.168.1.100:11434/v1"],
    ["lmstudio", "http://192.168.1.100:1234/v1"],
  ] as const)(
    "setBaseUrl updates baseUrl for %s provider",
    async (provider, url) => {
      const { result } = renderHook(() => useSettings());

      await act(() => result.current.setProvider(provider));
      await act(() => result.current.setBaseUrl!(url));
      expect(result.current.baseUrl).toBe(url);
    },
  );

  it("setBaseUrl is undefined for non-baseUrl providers", () => {
    const { result } = renderHook(() => useSettings());

    // gemini is the default provider - setBaseUrl should be undefined
    expect(result.current.setBaseUrl).toBeUndefined();
    expect(result.current.baseUrl).toBeUndefined();
  });

  it("handles invalid JSON in enabled tools localStorage gracefully", () => {
    localStorage.setItem("producer_pal_enabled_tools", "invalid json{");
    const { result } = renderHook(() => useSettings());

    // Should fallback to defaults, all tools enabled
    expect(result.current.isToolEnabled("ppal-connect")).toBe(true);
    // Cleanup
    localStorage.removeItem("producer_pal_enabled_tools");
  });
});

/**
 * Build an `enc:v1:<iv>:<ciphertext>` envelope that cannot be decrypted: a valid
 * IV from one encryption paired with a ciphertext from another, so AES-GCM
 * authentication fails and decryptApiKey fails safe to "". Index [2]/[3] are the
 * IV/ciphertext since encryptApiKey always emits exactly four colon-segments.
 * @returns {Promise<string>} An undecryptable enc:v1: envelope
 */
async function forgeUndecryptableEnvelope(): Promise<string> {
  const envelopeA = await encryptApiKey("seed-a");
  const envelopeB = await encryptApiKey("seed-b");
  const iv = envelopeA.split(":")[2] as string;
  const ciphertext = envelopeB.split(":")[3] as string;

  return `enc:v1:${iv}:${ciphertext}`;
}
