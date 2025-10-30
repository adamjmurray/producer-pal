/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/preact";
import { useSettings } from "./use-settings.js";

describe("useSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads default values when localStorage is empty", () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.apiKey).toBe("");
    expect(result.current.model).toBe("gemini-2.5-flash");
    expect(result.current.thinking).toBe("Auto");
    expect(result.current.temperature).toBe(1.0);
    expect(result.current.showThoughts).toBe(true);
    expect(result.current.hasApiKey).toBe(false);
  });

  it("loads values from localStorage on mount", () => {
    localStorage.setItem("gemini_api_key", "test-key");
    localStorage.setItem("gemini_model", "gemini-2.5-pro");
    localStorage.setItem("gemini_thinking", "High");
    localStorage.setItem("gemini_temperature", "0.7");
    localStorage.setItem("gemini_showThoughts", "false");

    const { result } = renderHook(() => useSettings());

    expect(result.current.apiKey).toBe("test-key");
    expect(result.current.model).toBe("gemini-2.5-pro");
    expect(result.current.thinking).toBe("High");
    expect(result.current.temperature).toBe(0.7);
    expect(result.current.showThoughts).toBe(false);
    expect(result.current.hasApiKey).toBe(true);
  });

  it("updates apiKey when setApiKey is called", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.setApiKey("new-key");
    });

    expect(result.current.apiKey).toBe("new-key");
  });

  it("updates model when setModel is called", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.setModel("gemini-2.5-flash-lite");
    });

    expect(result.current.model).toBe("gemini-2.5-flash-lite");
  });

  it("updates thinking when setThinking is called", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.setThinking("Low");
    });

    expect(result.current.thinking).toBe("Low");
  });

  it("updates temperature when setTemperature is called", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.setTemperature(0.5);
    });

    expect(result.current.temperature).toBe(0.5);
  });

  it("updates showThoughts when setShowThoughts is called", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.setShowThoughts(false);
    });

    expect(result.current.showThoughts).toBe(false);
  });

  it("saves settings to localStorage", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.setApiKey("new-key");
      result.current.setModel("gemini-2.5-flash-lite");
      result.current.setThinking("Medium");
      result.current.setTemperature(0.8);
      result.current.setShowThoughts(false);
    });

    act(() => {
      result.current.saveSettings();
    });

    expect(localStorage.getItem("gemini_api_key")).toBe("new-key");
    expect(localStorage.getItem("gemini_model")).toBe("gemini-2.5-flash-lite");
    expect(localStorage.getItem("gemini_thinking")).toBe("Medium");
    expect(localStorage.getItem("gemini_temperature")).toBe("0.8");
    expect(localStorage.getItem("gemini_showThoughts")).toBe("false");
  });

  it("reverts to saved settings on cancel", () => {
    localStorage.setItem("gemini_api_key", "saved-key");
    localStorage.setItem("gemini_model", "gemini-2.5-pro");

    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.setApiKey("temporary-key");
      result.current.setModel("gemini-2.5-flash");
    });

    expect(result.current.apiKey).toBe("temporary-key");
    expect(result.current.model).toBe("gemini-2.5-flash");

    act(() => {
      result.current.cancelSettings();
    });

    expect(result.current.apiKey).toBe("saved-key");
    expect(result.current.model).toBe("gemini-2.5-pro");
  });

  it("hasApiKey returns false when no key in localStorage", () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.hasApiKey).toBe(false);
  });

  it("hasApiKey returns true when key exists in localStorage", () => {
    localStorage.setItem("gemini_api_key", "test-key");
    const { result } = renderHook(() => useSettings());
    expect(result.current.hasApiKey).toBe(true);
  });
});
