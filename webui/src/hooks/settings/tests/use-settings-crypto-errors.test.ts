// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { renderHook, act, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Make the apiKey crypto throw so the load/save error paths in useSettings run.
vi.mock(import("#webui/lib/api-key-crypto"), () => ({
  encryptApiKey: vi.fn(() => Promise.reject(new Error("encrypt boom"))),
  decryptApiKey: vi.fn(() => Promise.reject(new Error("decrypt boom"))),
  isEncrypted: vi.fn(() => false),
  resetKeyCache: vi.fn(),
}));

const { useSettings } = await import("#webui/hooks/settings/use-settings");

/**
 * Render the hook and wait out the post-mount decrypt, which fails under this
 * suite's crypto mock. saveSettings is gated on that settling — the load's
 * catch is what unlocks save so the user can recover.
 * @returns The hook handle and the console.error spy
 */
async function renderPastFailedLoad() {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const { result } = renderHook(() => useSettings());

  await waitFor(() => {
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to load provider settings",
      expect.any(Error),
    );
  });

  return { result, errorSpy };
}

describe("useSettings crypto error handling", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("logs (does not throw) when the post-mount decrypt-load fails", async () => {
    localStorage.setItem(
      "producer_pal_provider_gemini",
      JSON.stringify({ apiKey: "enc:v1:bogus", model: "gemini-3.7-flash" }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderHook(() => useSettings());

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to load provider settings",
        expect.any(Error),
      );
    });
  });

  it("surfaces a saveError and leaves saved* unchanged when encrypt fails", async () => {
    const { result, errorSpy } = await renderPastFailedLoad();

    const initialSavedModel = result.current.savedModel;
    const initialSettingsConfigured = result.current.settingsConfigured;

    await act(() => {
      result.current.setApiKey("sk-will-fail-to-encrypt");
      result.current.setModel("gemini-3.7-flash");
    });

    let saved: boolean | undefined;

    await act(async () => {
      saved = await result.current.saveSettings();
    });

    // Failed persist returns false so the handler can keep the modal open,
    // and the in-memory saved* snapshots stay at their pre-save values
    // (committing them would route the app off settings that never landed
    // at rest — the silent-data-loss bug this fix addresses).
    expect(saved).toBe(false);
    expect(result.current.saveError).toMatch(/encrypt boom/);
    expect(result.current.savedModel).toBe(initialSavedModel);
    expect(result.current.settingsConfigured).toBe(initialSettingsConfigured);
    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to save provider settings",
        expect.any(Error),
      );
    });
  });

  it("leaves the localStorage flags alone when the encrypted write fails", async () => {
    localStorage.setItem("producer_pal_subagent_preset", "before");
    localStorage.setItem("producer_pal_small_model_mode", "false");
    const { result } = await renderPastFailedLoad();

    await act(() => {
      result.current.setApiKey("sk-will-fail-to-encrypt");
      result.current.setSubagentPresetId("after");
      result.current.setSmallModelMode(true);
    });

    await act(async () => {
      await result.current.saveSettings();
    });

    // These two write straight to localStorage, and Cancel reads them back —
    // so a failed Save that had already written them would be un-cancellable.
    expect(localStorage.getItem("producer_pal_subagent_preset")).toBe("before");
    expect(localStorage.getItem("producer_pal_small_model_mode")).toBe("false");
  });
});
