// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { renderHook, act } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { flushLoad } from "./use-settings-test-helpers";

describe("useSettings chatSetUp", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const SETUP_KEY = "producer_pal_settings_configured";

  /**
   * Render the hook, wait for the stored settings to load, run each edit (one
   * render apart, so a later edit sees the setters the earlier one enabled),
   * then Save.
   * @param edits - Changes made in the Settings dialog before Save
   * @returns The hook result
   */
  async function saveAfter(
    ...edits: Array<(settings: ReturnType<typeof useSettings>) => void>
  ) {
    const { result } = renderHook(() => useSettings());

    await flushLoad();

    for (const edit of edits) {
      await act(() => {
        edit(result.current);
      });
    }

    await act(async () => {
      await result.current.saveSettings();
    });

    return result;
  }

  it("is false by default", () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.chatSetUp).toBe(false);
  });

  it("loads from localStorage", () => {
    localStorage.setItem(SETUP_KEY, "true");
    const { result } = renderHook(() => useSettings());

    expect(result.current.chatSetUp).toBe(true);
  });

  it("is set by a save with an API key", async () => {
    const result = await saveAfter((s) => s.setApiKey("a-key"));

    expect(result.current.chatSetUp).toBe(true);
    expect(localStorage.getItem(SETUP_KEY)).toBe("true");
  });

  it("is set by a save for a local provider that needs no key", async () => {
    const result = await saveAfter((s) => s.setProvider("lmstudio"));

    expect(result.current.chatSetUp).toBe(true);
  });

  it("is set by a save for a custom provider with a URL and no key", async () => {
    const result = await saveAfter(
      (s) => s.setProvider("custom"),
      (s) => s.setBaseUrl?.("https://example.test/v1"),
    );

    expect(result.current.chatSetUp).toBe(true);
  });

  it("is left unset by a save for a custom provider with no URL or key", async () => {
    const result = await saveAfter((s) => s.setProvider("custom"));

    expect(result.current.chatSetUp).toBe(false);
  });

  it("is left unset by a save without an API key", async () => {
    const result = await saveAfter();

    expect(result.current.chatSetUp).toBe(false);
    expect(localStorage.getItem(SETUP_KEY)).toBeNull();
  });

  it("stays set when a later save has no API key", async () => {
    localStorage.setItem(SETUP_KEY, "true");

    const result = await saveAfter();

    expect(result.current.chatSetUp).toBe(true);
    expect(localStorage.getItem(SETUP_KEY)).toBe("true");
  });
});
