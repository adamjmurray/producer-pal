// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { type McpTool } from "#webui/hooks/connection/use-mcp-connection";
import { ToolToggles } from "./ToolToggles";

const TEST_TOOLS: McpTool[] = [
  { id: "ppal-connect", name: "Connect to Ableton" },
  { id: "ppal-read-live-set", name: "Read Live Set" },
  { id: "ppal-create-track", name: "Create Track" },
];

describe("ToolToggles", () => {
  const defaultProps = {
    tools: TEST_TOOLS,
    mcpStatus: "connected" as const,
    enabledTools: {
      "ppal-connect": true,
      "ppal-read-live-set": true,
      "ppal-create-track": true,
    },
    setEnabledTools: vi.fn(),
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

    it("renders all tools", () => {
      render(<ToolToggles {...defaultProps} />);

      expect(screen.getByLabelText("Connect to Ableton")).toBeDefined();
      expect(screen.getByLabelText("Read Live Set")).toBeDefined();
      expect(screen.getByLabelText("Create Track")).toBeDefined();
    });

    it("renders group headers for each tool category", () => {
      render(<ToolToggles {...defaultProps} />);

      expect(screen.getByText("Core")).toBeDefined();
      expect(screen.getByText("Live Set")).toBeDefined();
      expect(screen.getByText("Track")).toBeDefined();
    });
  });

  describe("loading and error states", () => {
    it("shows loading message when tools are null and connecting", () => {
      render(
        <ToolToggles {...defaultProps} tools={null} mcpStatus="connecting" />,
      );

      expect(screen.getByText("Loading tools...")).toBeDefined();
      expect(screen.queryByRole("checkbox")).toBeNull();
    });

    it("shows error message when tools are null and status is error", () => {
      render(<ToolToggles {...defaultProps} tools={null} mcpStatus="error" />);

      expect(screen.getByText("Tools cannot be loaded")).toBeDefined();
      expect(screen.queryByRole("checkbox")).toBeNull();
    });
  });

  describe("button interactions", () => {
    it("calls setEnabledTools with all enabled when Enable all is clicked", () => {
      const setEnabledTools = vi.fn();

      render(
        <ToolToggles {...defaultProps} setEnabledTools={setEnabledTools} />,
      );

      const button = screen.getByRole("button", { name: "Enable all" });

      fireEvent.click(button);

      expect(setEnabledTools).toHaveBeenCalledExactlyOnceWith({
        "ppal-connect": true,
        "ppal-read-live-set": true,
        "ppal-create-track": true,
      });
    });

    it("calls setEnabledTools with all disabled except session when Disable all is clicked", () => {
      const setEnabledTools = vi.fn();

      render(
        <ToolToggles {...defaultProps} setEnabledTools={setEnabledTools} />,
      );

      const button = screen.getByRole("button", { name: "Disable all" });

      fireEvent.click(button);

      expect(setEnabledTools).toHaveBeenCalledExactlyOnceWith({
        "ppal-connect": true,
        "ppal-read-live-set": false,
        "ppal-create-track": false,
      });
    });
  });

  describe("checkbox interactions", () => {
    it("all checkboxes are checked when all tools are enabled", () => {
      render(<ToolToggles {...defaultProps} />);

      const checkbox = screen.getByLabelText(
        "Connect to Ableton",
      ) as HTMLInputElement;

      expect(checkbox.checked).toBe(true);
    });

    it("checkbox is unchecked when tool is disabled", () => {
      const enabledTools = {
        ...defaultProps.enabledTools,
        "ppal-read-live-set": false,
      };

      render(<ToolToggles {...defaultProps} enabledTools={enabledTools} />);

      const checkbox = screen.getByLabelText(
        "Read Live Set",
      ) as HTMLInputElement;

      expect(checkbox.checked).toBe(false);
    });

    it("checkbox defaults to checked when tool is not in enabledTools", () => {
      // Pass empty object - tools not in enabledTools should default to enabled (true)
      render(<ToolToggles {...defaultProps} enabledTools={{}} />);

      const checkbox = screen.getByLabelText(
        "Read Live Set",
      ) as HTMLInputElement;

      expect(checkbox.checked).toBe(true);
    });

    it("calls setEnabledTools when checkbox is toggled", () => {
      const setEnabledTools = vi.fn();

      render(
        <ToolToggles {...defaultProps} setEnabledTools={setEnabledTools} />,
      );

      const checkbox = screen.getByLabelText("Read Live Set");

      fireEvent.click(checkbox);

      expect(setEnabledTools).toHaveBeenCalledOnce();
      const call = setEnabledTools.mock.calls[0]?.[0];

      expect(call?.["ppal-read-live-set"]).toBe(false); // Was true, now false
    });

    it("connect tool checkbox is always checked and disabled", () => {
      render(
        <ToolToggles
          {...defaultProps}
          enabledTools={{ "ppal-connect": false }}
        />,
      );

      const checkbox = screen.getByLabelText(
        "Connect to Ableton",
      ) as HTMLInputElement;

      expect(checkbox.checked).toBe(true);
      expect(checkbox.disabled).toBe(true);
    });

    it("does not call setEnabledTools when connect tool checkbox is clicked", () => {
      const setEnabledTools = vi.fn();

      render(
        <ToolToggles {...defaultProps} setEnabledTools={setEnabledTools} />,
      );

      const checkbox = screen.getByLabelText("Connect to Ableton");

      fireEvent.click(checkbox);

      expect(setEnabledTools).not.toHaveBeenCalled();
    });
  });
});
