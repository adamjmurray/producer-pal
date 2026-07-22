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

describe("useSettings crypto error handling", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("logs (does not throw) when the post-mount decrypt-load fails", async () => {
    localStorage.setItem(
      "producer_pal_provider_gemini",
      JSON.stringify({ apiKey: "enc:v1:bogus", model: "gemini-3.6-flash" }),
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
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useSettings());

    // saveSettings is gated on the post-mount decrypt settling — with the
    // crypto mock that rejects, the load's catch still unlocks save so the
    // user can recover. Wait for that settle first.
    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to load provider settings",
        expect.any(Error),
      );
    });

    const initialSavedModel = result.current.savedModel;
    const initialSettingsConfigured = result.current.settingsConfigured;

    await act(() => {
      result.current.setApiKey("sk-will-fail-to-encrypt");
      result.current.setModel("gemini-3.6-flash");
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
});
