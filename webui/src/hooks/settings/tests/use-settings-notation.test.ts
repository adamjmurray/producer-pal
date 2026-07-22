// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { renderHook, act } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { flushLoad } from "./use-settings-test-helpers";

describe("useSettings notation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts not dirty and reports the default notation", () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.notation).toBe("barbeat");
    expect(result.current.notationDirty).toBe(false);
  });

  it("setNotation marks dirty and updates the value", async () => {
    const { result } = renderHook(() => useSettings());

    await act(() => {
      result.current.setNotation("midi-json");
    });

    expect(result.current.notation).toBe("midi-json");
    expect(result.current.notationDirty).toBe(true);
  });

  it("seedNotation updates the value without marking dirty", async () => {
    const { result } = renderHook(() => useSettings());

    await act(() => {
      result.current.seedNotation("stark");
    });

    expect(result.current.notation).toBe("stark");
    expect(result.current.notationDirty).toBe(false);
  });

  it("saveSettings clears the dirty flag", async () => {
    const { result } = renderHook(() => useSettings());

    await flushLoad();
    await act(() => {
      result.current.setNotation("midi-json");
    });
    expect(result.current.notationDirty).toBe(true);

    await act(async () => {
      await result.current.saveSettings();
    });
    expect(result.current.notationDirty).toBe(false);
  });

  it("cancelSettings clears the dirty flag", async () => {
    const { result } = renderHook(() => useSettings());

    await act(() => {
      result.current.setNotation("midi-json");
    });
    expect(result.current.notationDirty).toBe(true);

    await act(() => {
      result.current.cancelSettings();
    });
    expect(result.current.notationDirty).toBe(false);
  });
});
