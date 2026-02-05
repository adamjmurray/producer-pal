// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRender = vi.fn();

// Mock preact render
vi.mock(import("preact"), () => ({
  render: mockRender,
}));

// Mock App component
vi.mock(import("./components/App"), () => ({
  App: () => <div>App</div>,
}));

// Mock CSS import
vi.mock(import("./main.css"), () => ({}));

describe("main", () => {
  beforeEach(() => {
    // Clear the module cache before each test
    vi.resetModules();
    mockRender.mockClear();
    // Clear any existing #app element
    const existingApp = document.getElementById("app");

    if (existingApp) {
      existingApp.remove();
    }
  });

  it("calls render with App component when #app element exists", async () => {
    // Create #app element before importing main
    const appElement = document.createElement("div");

    appElement.id = "app";
    document.body.appendChild(appElement);

    // Import main - it will execute and call render
    await import("./main.js");

    // Verify render was called with the App component and app element
    expect(mockRender).toHaveBeenCalled();
    expect(mockRender).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(HTMLElement),
    );
  });

  it("throws error when #app element does not exist", async () => {
    // Ensure no #app element exists (already removed in beforeEach)

    // Import should throw an error
    await expect(async () => {
      await import("./main.js");
    }).rejects.toThrow("Could not find #app element");
  });
});
