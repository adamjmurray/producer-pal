/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { ChatHeader } from "./ChatHeader.jsx";

describe("ChatHeader", () => {
  const defaultProps = {
    mcpStatus: "connected" as const,
    activeModel: null,
    activeThinking: null,
    activeTemperature: null,
    activeProvider: null,
    onOpenSettings: vi.fn(),
    onClearConversation: vi.fn(),
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

    it("shows provider and model name when both are set", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="gemini-2.5-pro"
          activeProvider="gemini"
        />,
      );
      expect(screen.getByText("Google | Gemini 2.5 Pro")).toBeDefined();
    });

    it("shows Flash model with provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="gemini-2.5-flash"
          activeProvider="gemini"
        />,
      );
      expect(screen.getByText("Google | Gemini 2.5 Flash")).toBeDefined();
    });

    it("shows Flash-Lite model with provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="gemini-2.5-flash-lite"
          activeProvider="gemini"
        />,
      );
      expect(screen.getByText("Google | Gemini 2.5 Flash-Lite")).toBeDefined();
    });

    it("shows unknown model ID as-is with provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="unknown-model"
          activeProvider="openai"
        />,
      );
      expect(screen.getByText("OpenAI | unknown-model")).toBeDefined();
    });

    it("does not show model when activeProvider is null", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="gemini-2.5-pro"
          activeProvider={null}
        />,
      );
      expect(screen.queryByText(/Gemini 2.5 Pro/)).toBeNull();
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
          activeProvider="gemini"
          activeThinking="High"
          activeTemperature={1.5}
        />,
      );

      expect(screen.getByText("✓ Ready")).toBeDefined();
      expect(screen.getByText("Google | Gemini 2.5 Pro")).toBeDefined();
      expect(screen.getByText("Thinking: High")).toBeDefined();
      expect(screen.getByText("75% random")).toBeDefined();
    });
  });

  describe("provider display format", () => {
    it("shows Google for gemini provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="gemini-2.5-pro"
          activeProvider="gemini"
        />,
      );
      expect(screen.getByText(/Google \|/)).toBeDefined();
    });

    it("shows OpenAI for openai provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="gpt-4"
          activeProvider="openai"
        />,
      );
      expect(screen.getByText(/OpenAI \|/)).toBeDefined();
    });

    it("shows Mistral for mistral provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="mistral-large"
          activeProvider="mistral"
        />,
      );
      expect(screen.getByText(/Mistral \|/)).toBeDefined();
    });

    it("shows OpenRouter for openrouter provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="some-model"
          activeProvider="openrouter"
        />,
      );
      expect(screen.getByText(/OpenRouter \|/)).toBeDefined();
    });

    it("shows LM Studio for lmstudio provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="local-model"
          activeProvider="lmstudio"
        />,
      );
      expect(screen.getByText(/LM Studio \|/)).toBeDefined();
    });

    it("shows Ollama for ollama provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="llama2"
          activeProvider="ollama"
        />,
      );
      expect(screen.getByText(/Ollama \|/)).toBeDefined();
    });

    it("shows Custom for custom provider", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="custom-model"
          activeProvider="custom"
        />,
      );
      expect(screen.getByText(/Custom \|/)).toBeDefined();
    });
  });

  describe("Restart button", () => {
    it("does not show Restart button when activeModel is null", () => {
      render(<ChatHeader {...defaultProps} activeModel={null} />);
      expect(screen.queryByRole("button", { name: "Restart" })).toBeNull();
    });

    it("shows Restart button when activeModel is set", () => {
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="gemini-2.5-pro"
          activeProvider="gemini"
        />,
      );
      expect(screen.getByRole("button", { name: "Restart" })).toBeDefined();
    });

    it("calls window.confirm when Restart clicked", () => {
      const originalConfirm = window.confirm;
      window.confirm = vi.fn().mockReturnValue(false);

      render(
        <ChatHeader
          {...defaultProps}
          activeModel="gemini-2.5-pro"
          activeProvider="gemini"
        />,
      );

      const button = screen.getByRole("button", { name: "Restart" });
      fireEvent.click(button);

      expect(window.confirm).toHaveBeenCalledWith(
        "Clear all messages and restart conversation?",
      );
      window.confirm = originalConfirm;
    });

    it("does not call onClearConversation when user cancels confirmation", () => {
      const originalConfirm = window.confirm;
      window.confirm = vi.fn().mockReturnValue(false);

      const onClearConversation = vi.fn();
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="gemini-2.5-pro"
          activeProvider="gemini"
          onClearConversation={onClearConversation}
        />,
      );

      const button = screen.getByRole("button", { name: "Restart" });
      fireEvent.click(button);

      expect(onClearConversation).not.toHaveBeenCalled();
      window.confirm = originalConfirm;
    });

    it("calls onClearConversation when user confirms", () => {
      const originalConfirm = window.confirm;
      window.confirm = vi.fn().mockReturnValue(true);

      const onClearConversation = vi.fn();
      render(
        <ChatHeader
          {...defaultProps}
          activeModel="gemini-2.5-pro"
          activeProvider="gemini"
          onClearConversation={onClearConversation}
        />,
      );

      const button = screen.getByRole("button", { name: "Restart" });
      fireEvent.click(button);

      expect(onClearConversation).toHaveBeenCalledOnce();
      window.confirm = originalConfirm;
    });
  });
});
