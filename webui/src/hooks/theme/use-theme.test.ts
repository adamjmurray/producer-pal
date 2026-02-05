// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 * @returns {any} - Hook return value
 */
import { renderHook, act, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "./use-theme";

/**
 * Create a MediaQueryList mock with optional overrides
 * @param overrides - Optional properties to override in the mock
 * @returns Mock MediaQueryList object
 */
const createMediaQueryListMock = (
  overrides: Partial<MediaQueryList> = {},
): MediaQueryList =>
  ({
    matches: false,
    media: "(prefers-color-scheme: dark)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    ...overrides,
  }) as MediaQueryList;

describe("useTheme", () => {
  let matchMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    matchMediaMock = vi.fn(() => createMediaQueryListMock());
    window.matchMedia = matchMediaMock as unknown as typeof window.matchMedia;
  });

  it("defaults to system theme", () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("system");
  });

  it("loads theme from localStorage", () => {
    localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("dark");
  });

  it("applies dark class when theme is dark", async () => {
    const { result } = renderHook(() => useTheme());

    await act(() => {
      result.current.setTheme("dark");
    });

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("removes dark class when theme is light", async () => {
    document.documentElement.classList.add("dark");
    const { result } = renderHook(() => useTheme());

    await act(() => {
      result.current.setTheme("light");
    });

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  it.each([
    [true, "dark"],
    [false, "light"],
  ])(
    "respects system preference for %s mode when theme is system",
    async (matches, mode) => {
      matchMediaMock.mockReturnValue(createMediaQueryListMock({ matches }));

      const { result } = renderHook(() => useTheme());

      await act(() => result.current.setTheme("system"));

      await waitFor(() => {
        expect(document.documentElement.classList.contains("dark")).toBe(
          mode === "dark",
        );
      });
    },
  );

  it("saves and updates theme in localStorage", async () => {
    const { result } = renderHook(() => useTheme());

    await act(() => result.current.setTheme("dark"));
    await waitFor(() => expect(localStorage.getItem("theme")).toBe("dark"));

    await act(() => result.current.setTheme("light"));
    await waitFor(() => expect(localStorage.getItem("theme")).toBe("light"));
  });

  it("adds event listener for system theme changes", () => {
    const mockAddEventListener = vi.fn();

    matchMediaMock.mockReturnValue(
      createMediaQueryListMock({ addEventListener: mockAddEventListener }),
    );

    renderHook(() => useTheme());

    expect(mockAddEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });

  it("removes event listener on cleanup when using system theme", () => {
    const mockRemoveEventListener = vi.fn();

    matchMediaMock.mockReturnValue(
      createMediaQueryListMock({
        removeEventListener: mockRemoveEventListener,
      }),
    );

    const { unmount } = renderHook(() => useTheme());

    unmount();

    expect(mockRemoveEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });
});
