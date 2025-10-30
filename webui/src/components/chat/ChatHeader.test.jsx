/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { ChatHeader } from "./ChatHeader.jsx";

describe("ChatHeader", () => {
  const defaultProps = {
    mcpStatus: "connected",
    activeModel: null,
    activeThinking: null,
    activeTemperature: null,
    theme: "system",
    setTheme: vi.fn(),
    onOpenSettings: vi.fn(),
  };

  describe("basic rendering", () => {
    it("renders title", () => {
      render(<ChatHeader {...defaultProps} />);
      expect(screen.getByText("Producer Pal Chat")).toBeDefined();
    });

    it("renders logo image", () => {
      render(<ChatHeader {...defaultProps} />);
      const logo = screen.getByAltText("Producer Pal");
      expect(logo).toBeDefined();
    });

    it("renders Settings button", () => {
      render(<ChatHeader {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Settings" })).toBeDefined();
    });

    it("renders theme selector", () => {
      render(<ChatHeader {...defaultProps} />);
      const select = screen.getByRole("combobox");
      expect(select).toBeDefined();
    });

    it("has theme options", () => {
      render(<ChatHeader {...defaultProps} />);
      expect(screen.getByRole("option", { name: "System" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Light" })).toBeDefined();
      expect(screen.getByRole("option", { name: "Dark" })).toBeDefined();
    });
  });

  describe("mcpStatus display", () => {
    it("shows Ready when status is connected", () => {
      render(<ChatHeader {...defaultProps} mcpStatus="connected" />);
      expect(screen.getByText("✓ Ready")).toBeDefined();
    });

    it("shows Looking for Producer Pal when status is connecting", () => {
      render(<ChatHeader {...defaultProps} mcpStatus="connecting" />);
      expect(screen.getByText("👀 Looking for Producer Pal...")).toBeDefined();
    });

    it("shows Error when status is error", () => {
      render(<ChatHeader {...defaultProps} mcpStatus="error" />);
      expect(screen.getByText("✗ Error")).toBeDefined();
    });
  });

  describe("activeModel display", () => {
    it("does not show model when activeModel is null", () => {
      render(<ChatHeader {...defaultProps} activeModel={null} />);
      expect(screen.queryByText(/Gemini/)).toBeNull();
    });

    it("shows model name when activeModel is set", () => {
      render(<ChatHeader {...defaultProps} activeModel="gemini-2.5-pro" />);
      expect(screen.getByText("Gemini 2.5 Pro")).toBeDefined();
    });

    it("shows Flash model name", () => {
      render(<ChatHeader {...defaultProps} activeModel="gemini-2.5-flash" />);
      expect(screen.getByText("Gemini 2.5 Flash")).toBeDefined();
    });

    it("shows Flash-Lite model name", () => {
      render(
        <ChatHeader {...defaultProps} activeModel="gemini-2.5-flash-lite" />,
      );
      expect(screen.getByText("Gemini 2.5 Flash-Lite")).toBeDefined();
    });

    it("shows unknown model ID as-is", () => {
      render(<ChatHeader {...defaultProps} activeModel="unknown-model" />);
      expect(screen.getByText("unknown-model")).toBeDefined();
    });
  });

  describe("activeThinking display", () => {
    it("does not show thinking when activeThinking is null", () => {
      render(<ChatHeader {...defaultProps} activeThinking={null} />);
      expect(screen.queryByText(/Thinking:/)).toBeNull();
    });

    it("shows thinking level when activeThinking is set", () => {
      render(<ChatHeader {...defaultProps} activeThinking="Medium" />);
      expect(screen.getByText("Thinking: Medium")).toBeDefined();
    });

    it("shows Off thinking level", () => {
      render(<ChatHeader {...defaultProps} activeThinking="Off" />);
      expect(screen.getByText("Thinking: Off")).toBeDefined();
    });

    it("shows Auto thinking level", () => {
      render(<ChatHeader {...defaultProps} activeThinking="Auto" />);
      expect(screen.getByText("Thinking: Auto")).toBeDefined();
    });
  });

  describe("activeTemperature display", () => {
    it("does not show randomness when activeTemperature is null", () => {
      render(<ChatHeader {...defaultProps} activeTemperature={null} />);
      expect(screen.queryByText(/random/)).toBeNull();
    });

    it("shows 0% random when temperature is 0", () => {
      render(<ChatHeader {...defaultProps} activeTemperature={0} />);
      expect(screen.getByText("0% random")).toBeDefined();
    });

    it("shows 50% random when temperature is 1", () => {
      render(<ChatHeader {...defaultProps} activeTemperature={1} />);
      expect(screen.getByText("50% random")).toBeDefined();
    });

    it("shows 100% random when temperature is 2", () => {
      render(<ChatHeader {...defaultProps} activeTemperature={2} />);
      expect(screen.getByText("100% random")).toBeDefined();
    });

    it("shows 25% random when temperature is 0.5", () => {
      render(<ChatHeader {...defaultProps} activeTemperature={0.5} />);
      expect(screen.getByText("25% random")).toBeDefined();
    });
  });

  describe("theme selector", () => {
    it("has correct initial value", () => {
      render(<ChatHeader {...defaultProps} theme="dark" />);
      const select = screen.getByRole("combobox");
      expect(select.value).toBe("dark");
    });

    it("calls setTheme when changed", () => {
      const setTheme = vi.fn();
      render(<ChatHeader {...defaultProps} setTheme={setTheme} />);

      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "dark" } });

      expect(setTheme).toHaveBeenCalledOnce();
      expect(setTheme).toHaveBeenCalledWith("dark");
    });
  });

  describe("Settings button", () => {
    it("calls onOpenSettings when clicked", () => {
      const onOpenSettings = vi.fn();
      render(<ChatHeader {...defaultProps} onOpenSettings={onOpenSettings} />);

      const button = screen.getByRole("button", { name: "Settings" });
      fireEvent.click(button);

      expect(onOpenSettings).toHaveBeenCalledOnce();
    });
  });

  describe("combined display", () => {
    it("shows all active settings together", () => {
      render(
        <ChatHeader
          {...defaultProps}
          mcpStatus="connected"
          activeModel="gemini-2.5-pro"
          activeThinking="High"
          activeTemperature={1.5}
        />,
      );

      expect(screen.getByText("✓ Ready")).toBeDefined();
      expect(screen.getByText("Gemini 2.5 Pro")).toBeDefined();
      expect(screen.getByText("Thinking: High")).toBeDefined();
      expect(screen.getByText("75% random")).toBeDefined();
    });
  });
});
