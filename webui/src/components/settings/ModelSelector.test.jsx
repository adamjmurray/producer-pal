/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { ModelSelector } from "./ModelSelector.jsx";

describe("ModelSelector", () => {
  it("renders with correct selected model", () => {
    const setModel = vi.fn();
    render(<ModelSelector model="gemini-2.5-flash" setModel={setModel} />);

    const select = screen.getByRole("combobox");
    expect(select.value).toBe("gemini-2.5-flash");
  });

  it("displays all model options", () => {
    const setModel = vi.fn();
    render(<ModelSelector model="gemini-2.5-flash" setModel={setModel} />);

    expect(
      screen.getByRole("option", { name: /Gemini 2.5 Pro/ }),
    ).toBeDefined();
    expect(
      screen.getByRole("option", { name: /Gemini 2.5 Flash \(fast/ }),
    ).toBeDefined();
    expect(
      screen.getByRole("option", { name: /Gemini 2.5 Flash-Lite/ }),
    ).toBeDefined();
  });

  it("has correct option values", () => {
    const setModel = vi.fn();
    render(<ModelSelector model="gemini-2.5-flash" setModel={setModel} />);

    const options = screen.getAllByRole("option");
    expect(options[0].value).toBe("gemini-2.5-pro");
    expect(options[1].value).toBe("gemini-2.5-flash");
    expect(options[2].value).toBe("gemini-2.5-flash-lite");
  });

  it("triggers setModel callback on change", () => {
    const setModel = vi.fn();
    render(<ModelSelector model="gemini-2.5-flash" setModel={setModel} />);

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "gemini-2.5-pro" } });

    expect(setModel).toHaveBeenCalledOnce();
    expect(setModel).toHaveBeenCalledWith("gemini-2.5-pro");
  });

  it("can select gemini-2.5-flash-lite", () => {
    const setModel = vi.fn();
    render(<ModelSelector model="gemini-2.5-flash" setModel={setModel} />);

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "gemini-2.5-flash-lite" } });

    expect(setModel).toHaveBeenCalledWith("gemini-2.5-flash-lite");
  });
});
