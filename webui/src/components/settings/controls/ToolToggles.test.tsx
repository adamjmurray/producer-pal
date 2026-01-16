/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { TOOLS } from "#webui/lib/constants/tools";
import { ToolToggles } from "./ToolToggles";

describe("ToolToggles", () => {
  const defaultProps = {
    enabledTools: TOOLS.reduce<Record<string, boolean>>((acc, tool) => {
      acc[tool.id] = true;

      return acc;
    }, {}),
    setEnabledTools: vi.fn(),
    enableAllTools: vi.fn(),
    disableAllTools: vi.fn(),
  };

  describe("basic rendering", () => {
    it("renders title", () => {
      render(<ToolToggles {...defaultProps} />);
      expect(screen.getByText("Available Tools")).toBeDefined();
    });

    it("renders Enable all button", () => {
      render(<ToolToggles {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Enable all" })).toBeDefined();
    });

    it("renders Disable all button", () => {
      render(<ToolToggles {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Disable all" })).toBeDefined();
    });

    it("renders all non-conditional tools", () => {
      render(<ToolToggles {...defaultProps} />);

      // Check for a few tools (not Raw Live API which is conditional)
      expect(screen.getByLabelText("Connect to Ableton Live")).toBeDefined();
      expect(screen.getByLabelText("Project Notes")).toBeDefined();
      expect(screen.getByLabelText("Read Live Set")).toBeDefined();
      expect(screen.getByLabelText("Create Track")).toBeDefined();
    });
  });

  describe("button interactions", () => {
    it("calls enableAllTools when Enable all button is clicked", () => {
      const enableAllTools = vi.fn();

      render(<ToolToggles {...defaultProps} enableAllTools={enableAllTools} />);

      const button = screen.getByRole("button", { name: "Enable all" });

      fireEvent.click(button);

      expect(enableAllTools).toHaveBeenCalledOnce();
    });

    it("calls disableAllTools when Disable all button is clicked", () => {
      const disableAllTools = vi.fn();

      render(
        <ToolToggles {...defaultProps} disableAllTools={disableAllTools} />,
      );

      const button = screen.getByRole("button", { name: "Disable all" });

      fireEvent.click(button);

      expect(disableAllTools).toHaveBeenCalledOnce();
    });
  });

  describe("checkbox interactions", () => {
    it("all checkboxes are checked when all tools are enabled", () => {
      render(<ToolToggles {...defaultProps} />);

      const checkbox = screen.getByLabelText(
        "Connect to Ableton Live",
      ) as HTMLInputElement;

      expect(checkbox.checked).toBe(true);
    });

    it("checkbox is unchecked when tool is disabled", () => {
      const enabledTools = {
        ...defaultProps.enabledTools,
        "ppal-connect": false,
      };

      render(<ToolToggles {...defaultProps} enabledTools={enabledTools} />);

      const checkbox = screen.getByLabelText(
        "Connect to Ableton Live",
      ) as HTMLInputElement;

      expect(checkbox.checked).toBe(false);
    });

    it("checkbox defaults to checked when tool is not in enabledTools", () => {
      // Pass empty object - tools not in enabledTools should default to enabled (true)
      render(<ToolToggles {...defaultProps} enabledTools={{}} />);

      const checkbox = screen.getByLabelText(
        "Connect to Ableton Live",
      ) as HTMLInputElement;

      expect(checkbox.checked).toBe(true);
    });

    it("calls setEnabledTools when checkbox is toggled", () => {
      const setEnabledTools = vi.fn();

      render(
        <ToolToggles {...defaultProps} setEnabledTools={setEnabledTools} />,
      );

      const checkbox = screen.getByLabelText("Connect to Ableton Live");

      fireEvent.click(checkbox);

      expect(setEnabledTools).toHaveBeenCalledOnce();
      // Check that it was called with the tool toggled
      const call = setEnabledTools.mock.calls[0]?.[0];

      expect(call?.["ppal-connect"]).toBe(false); // Was true, now false
    });
  });

  describe("Raw Live API conditional rendering", () => {
    it("does not render Raw Live API when env var is false", () => {
      // Default test environment has ENABLE_RAW_LIVE_API = false
      render(<ToolToggles {...defaultProps} />);

      expect(screen.queryByLabelText("Raw Live API")).toBeNull();
    });
  });
});
