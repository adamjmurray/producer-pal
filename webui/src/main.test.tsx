// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRender = vi.fn();

// Mock preact render
vi.mock(import("preact"), () => ({
  render: mockRender,
}));

// Mock App component
vi.mock(import("./components/App"), () => ({
  App: () => <div>App</div>,
}));

// Mock ContextApp component
vi.mock(import("./components/context/ContextApp"), () => ({
  ContextApp: () => <div>ContextApp</div>,
}));

// Mock GenLayout component
vi.mock(import("./components/gen/GenLayout"), () => ({
  GenLayout: () => <div>GenLayout</div>,
}));

// Mock DemoMode component
vi.mock(import("./demo/DemoMode"), () => ({
  DemoMode: () => <div>DemoMode</div>,
}));

// Mock CSS import
vi.mock(import("./main.css"), () => ({}));

/**
 * @returns The name of the component main rendered at the root
 */
function rootName(): string {
  const root = mockRender.mock.calls[0]?.[0] as { type: { name: string } };

  return root.type.name;
}

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

    // Reset pathname between tests
    window.history.replaceState({}, "", "/chat");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it("renders DemoMode when ?demo query param is present", async () => {
    const appElement = document.createElement("div");

    appElement.id = "app";
    document.body.appendChild(appElement);

    // Set demo query param before importing
    window.location.search = "?demo";

    try {
      await import("./main.js");

      expect(mockRender).toHaveBeenCalled();
    } finally {
      // Restore search params for subsequent tests
      window.location.search = "";
    }
  });

  it("renders ContextApp when path is /context", async () => {
    const appElement = document.createElement("div");

    appElement.id = "app";
    document.body.appendChild(appElement);

    window.history.replaceState({}, "", "/context");

    await import("./main.js");

    expect(mockRender).toHaveBeenCalled();
  });

  it.each([
    ["true", "/chat?view=gen", "GenLayout"],
    ["true", "/chat?view=other", "App"],
    // A release build has no panel to show.
    ["false", "/chat?view=gen", "App"],
  ])("with ENABLE_GEN_UI=%s, %s renders %s", async (flag, url, expected) => {
    vi.stubEnv("ENABLE_GEN_UI", flag);

    const appElement = document.createElement("div");

    appElement.id = "app";
    document.body.appendChild(appElement);

    window.history.replaceState({}, "", url);
    await import("./main.js");

    expect(rootName()).toBe(expected);
  });

  it("throws error when #app element does not exist", async () => {
    // Ensure no #app element exists (already removed in beforeEach)

    // Import should throw an error
    await expect(async () => {
      await import("./main.js");
    }).rejects.toThrow("Could not find #app element");
  });
});
