/**
 * @vitest-environment happy-dom
 * @returns {any} - Hook return value
 */
import { renderHook, act, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "./use-theme";

describe("useTheme", () => {
  let matchMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");

    // Mock window.matchMedia
    matchMediaMock = vi.fn(
      (): MediaQueryList =>
        ({
          matches: false,
          media: "(prefers-color-scheme: dark)",
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList,
    );
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

  it("respects system preference for dark mode when theme is system", async () => {
    matchMediaMock.mockReturnValue({
      matches: true,
      media: "(prefers-color-scheme: dark)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as MediaQueryList);

    const { result } = renderHook(() => useTheme());

    await act(() => {
      result.current.setTheme("system");
    });

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("respects system preference for light mode when theme is system", async () => {
    matchMediaMock.mockReturnValue({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as MediaQueryList);

    const { result } = renderHook(() => useTheme());

    await act(() => {
      result.current.setTheme("system");
    });

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  it("saves theme to localStorage when changed", async () => {
    const { result } = renderHook(() => useTheme());

    await act(() => {
      result.current.setTheme("dark");
    });

    await waitFor(() => {
      expect(localStorage.getItem("theme")).toBe("dark");
    });
  });

  it("updates localStorage when theme changes", async () => {
    const { result } = renderHook(() => useTheme());

    await act(() => {
      result.current.setTheme("dark");
    });

    await waitFor(() => {
      expect(localStorage.getItem("theme")).toBe("dark");
    });

    await act(() => {
      result.current.setTheme("light");
    });

    await waitFor(() => {
      expect(localStorage.getItem("theme")).toBe("light");
    });
  });

  it("adds event listener for system theme changes", () => {
    const mockAddEventListener = vi.fn();

    matchMediaMock.mockReturnValue({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: mockAddEventListener,
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as MediaQueryList);

    renderHook(() => useTheme());

    expect(mockAddEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });

  it("removes event listener on cleanup when using system theme", () => {
    const mockRemoveEventListener = vi.fn();

    matchMediaMock.mockReturnValue({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: vi.fn(),
      removeEventListener: mockRemoveEventListener,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as MediaQueryList);

    const { unmount } = renderHook(() => useTheme());

    unmount();

    expect(mockRemoveEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });
});
