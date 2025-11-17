/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";

const mockRender = vi.fn();

// Mock preact render
vi.mock("preact", () => ({
  render: mockRender,
}));

// Mock App component
vi.mock("./components/App.jsx", () => ({
  App: () => <div>App</div>,
}));

// Mock CSS import
vi.mock("./main.css", () => ({}));

describe("main", () => {
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
});
