// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, act } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import { useViewState } from "./use-view-state";

const VIEW_STATE_KEY = "producer_pal_view_state";

describe("useViewState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default values when no localStorage entry exists", () => {
    const { result } = renderHook(() => useViewState());

    expect(result.current.viewState).toStrictEqual({
      historyPanelOpen: false,
      settingsOpen: false,
      settingsTab: "connection",
    });
  });

  it("loads persisted state from localStorage", () => {
    localStorage.setItem(
      VIEW_STATE_KEY,
      JSON.stringify({ historyPanelOpen: true, settingsTab: "tools" }),
    );

    const { result } = renderHook(() => useViewState());

    expect(result.current.viewState.historyPanelOpen).toBe(true);
    expect(result.current.viewState.settingsTab).toBe("tools");
    expect(result.current.viewState.settingsOpen).toBe(false);
  });

  it("merges partial updates and persists to localStorage", async () => {
    const { result } = renderHook(() => useViewState());

    await act(async () => {
      result.current.setViewState({ historyPanelOpen: true });
    });

    expect(result.current.viewState.historyPanelOpen).toBe(true);
    expect(result.current.viewState.settingsOpen).toBe(false);

    const stored = JSON.parse(localStorage.getItem(VIEW_STATE_KEY)!);

    expect(stored.historyPanelOpen).toBe(true);
    expect(stored.settingsOpen).toBe(false);
  });

  it("handles invalid JSON in localStorage gracefully", () => {
    localStorage.setItem(VIEW_STATE_KEY, "not-json");

    const { result } = renderHook(() => useViewState());

    expect(result.current.viewState).toStrictEqual({
      historyPanelOpen: false,
      settingsOpen: false,
      settingsTab: "connection",
    });
  });

  it("resets corrupted settingsTab to default", () => {
    localStorage.setItem(VIEW_STATE_KEY, JSON.stringify({ settingsTab: 42 }));

    const { result } = renderHook(() => useViewState());

    expect(result.current.viewState.settingsTab).toBe("connection");
  });

  it("updates settings tab", async () => {
    const { result } = renderHook(() => useViewState());

    await act(async () => {
      result.current.setViewState({ settingsTab: "display" });
    });

    expect(result.current.viewState.settingsTab).toBe("display");
  });
});
